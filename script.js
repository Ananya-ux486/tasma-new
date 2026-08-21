/* =========================================================
   TASMAFIVE SERVICES SLIDER
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // RESUME UPLOAD - JOB REQUIREMENT
    // =========================================

    const reasonSelect = document.getElementById("reason");
    const resumeUploadGroup = document.getElementById("resumeUploadGroup");
    const resumeInput = document.getElementById("resume");

    if (reasonSelect && resumeUploadGroup && resumeInput) {
        reasonSelect.addEventListener("change", function () {
            if (this.value === "Job Requirement") {
                resumeUploadGroup.style.display = "block";
                resumeInput.required = true;
            } else {
                resumeUploadGroup.style.display = "none";
                resumeInput.required = false;
                resumeInput.value = "";
            }
        });
    }


    // =========================================
    // PAYMENT MODAL
    // =========================================

    const payNowBtn       = document.getElementById("payNowButton");
    const paymentModal    = document.getElementById("paymentModal");
    const payModalClose   = document.getElementById("payModalClose");
    const paymentForm     = document.getElementById("paymentForm");

    /* Open modal */
    function openPaymentModal() {
        if (!paymentModal) return;
        paymentModal.classList.add("active");
        document.body.style.overflow = "hidden";
        // focus first input for accessibility
        setTimeout(() => {
            const first = paymentModal.querySelector("input, select");
            if (first) first.focus();
        }, 320);
    }

    /* Close modal */
    function closePaymentModal() {
        if (!paymentModal) return;
        paymentModal.classList.remove("active");
        document.body.style.overflow = "";
    }

    /* Pay Now button click */
    if (payNowBtn) {
        payNowBtn.addEventListener("click", openPaymentModal);
    }

    /* Close button click */
    if (payModalClose) {
        payModalClose.addEventListener("click", closePaymentModal);
    }

    /* Click outside modal card to close */
    if (paymentModal) {
        paymentModal.addEventListener("click", function (e) {
            if (e.target === paymentModal) {
                closePaymentModal();
            }
        });
    }

    /* Escape key to close */
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && paymentModal && paymentModal.classList.contains("active")) {
            closePaymentModal();
        }
    });

    /* Payment form submit - Razorpay Integration */
    if (paymentForm) {
        paymentForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const name     = document.getElementById("pay-name").value.trim();
            const email    = document.getElementById("pay-email").value.trim();
            const phoneNum = document.getElementById("pay-phone").value.trim();
            const service  = document.getElementById("pay-service").value;
            const amount   = document.getElementById("pay-amount").value.trim();

            if (!name)    { alert("Please enter your full name.");     return; }
            if (!email)   { alert("Please enter your email address."); return; }
            if (!phoneNum){ alert("Please enter your mobile number."); return; }
            if (!service) { alert("Please select a service.");         return; }
            if (!amount || parseFloat(amount) <= 0) { alert("Please enter a valid amount."); return; }

            // Start Razorpay payment
            startRazorpayPayment(name, email, phoneNum, service, amount);
        });
    }

    /* =====================================================
       RAZORPAY INTEGRATION
    ===================================================== */

    function loadRazorpay() {
        return new Promise((resolve) => {
            if (window.Razorpay) return resolve(true);
            const script = document.createElement("script");
            script.src = "https://checkout.razorpay.com/v1/checkout.js";
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    }

    async function startRazorpayPayment(name, email, phone, service, amount) {
        try {
            // Show loading state
            const submitButton = paymentForm.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;
            submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            submitButton.disabled = true;

            // Create payment order
            const response = await fetch('/api/payments/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentType: 'custom',
                    customAmount: amount,
                    name: name,
                    email: email,
                    phone: phone
                })
            });

            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Payment creation failed');
            }

            if (result.kind !== 'razorpay') {
                throw new Error('Invalid payment response');
            }

            // Load Razorpay script
            if (!(await loadRazorpay()) || !window.Razorpay) {
                throw new Error('Razorpay checkout could not load. Please retry.');
            }

            // Configure Razorpay checkout
            const options = {
                key: result.keyId,
                order_id: result.orderId,
                amount: result.amount,
                currency: result.currency,
                name: 'TasmaFive Solutions',
                description: result.description,
                prefill: {
                    name: name,
                    email: email,
                    contact: phone
                },
                theme: { color: '#0f172a' },
                modal: {
                    ondismiss: function() {
                        // Reset button
                        submitButton.innerHTML = originalText;
                        submitButton.disabled = false;
                        
                        // Optional: Track cancelled payments
                        fetch('/api/payments/cancel', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reference: result.reference })
                        }).catch(() => {}); // Ignore errors
                    }
                },
                handler: async function(razorpayResponse) {
                    try {
                        // Verify payment
                        const verifyResponse = await fetch('/api/payments/razorpay/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                ...razorpayResponse,
                                reference: result.reference
                            })
                        });

                        const verifyResult = await verifyResponse.json();
                        
                        if (verifyResponse.ok && verifyResult.ok) {
                            // Payment successful
                            alert('Payment successful! Thank you for your payment.');
                            
                            // Reset form
                            paymentForm.reset();
                            closePaymentModal();
                            
                            // Redirect to success page
                            window.location.href = `/payment-success.html?reference=${result.reference}&amount=${amount}`;
                        } else {
                            throw new Error(verifyResult.error || 'Payment verification failed');
                        }
                    } catch (error) {
                        console.error('Payment verification error:', error);
                        alert('Payment verification failed: ' + error.message);
                    }
                    
                    // Reset button
                    submitButton.innerHTML = originalText;
                    submitButton.disabled = false;
                }
            };

            // Open Razorpay checkout
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response) {
                console.error('Payment failed:', response.error);
                alert('Payment failed: ' + (response.error.description || 'Please try again'));
                
                // Reset button
                submitButton.innerHTML = originalText;
                submitButton.disabled = false;
            });
            
            rzp.open();

        } catch (error) {
            console.error('Payment error:', error);
            alert('Payment failed: ' + error.message);
            
            // Reset button
            const submitButton = paymentForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.innerHTML = '<span>Pay Now</span> <i class="fa-solid fa-arrow-right"></i>';
                submitButton.disabled = false;
            }
        }
    }


    /* =====================================================
       SLIDER ELEMENTS
    ===================================================== */

    const slides = document.querySelectorAll(".service-slide");
    const indicators = document.querySelectorAll(".indicator");

    const prevButton =
        document.querySelector(".prev-arrow");

    const nextButton =
        document.querySelector(".next-arrow");

    const servicesPanel =
        document.querySelector(".services-panel");


    let currentSlide = 0;
    let autoSlide = null;
    let isAnimating = false;

    const animationDuration = 750;


    /* =====================================================
       SHOW SLIDE
    ===================================================== */

    function showSlide(index, direction = "next") {

        if (!slides.length) return;
        if (isAnimating)    return;

        if (index >= slides.length) index = 0;
        if (index < 0)              index = slides.length - 1;
        if (index === currentSlide) return;

        isAnimating = true;

        if (servicesPanel) {
            servicesPanel.classList.remove("slide-next", "slide-prev");
            void servicesPanel.offsetWidth;
            servicesPanel.classList.add(direction === "next" ? "slide-next" : "slide-prev");
        }

        slides[currentSlide].classList.remove("active");

        indicators.forEach((indicator, i) => {
            indicator.classList.toggle("active", i === index);
        });

        setTimeout(() => {
            slides[index].classList.add("active");
        }, 250);

        currentSlide = index;

        setTimeout(() => {
            if (servicesPanel) {
                servicesPanel.classList.remove("slide-next", "slide-prev");
            }
            isAnimating = false;
        }, animationDuration);
    }


    /* =====================================================
       NEXT / PREV
    ===================================================== */

    function nextSlide() {
        showSlide(currentSlide + 1, "next");
        restartAutoSlide();
    }

    function previousSlide() {
        showSlide(currentSlide - 1, "prev");
        restartAutoSlide();
    }

    if (nextButton) nextButton.addEventListener("click", nextSlide);
    if (prevButton) prevButton.addEventListener("click", previousSlide);


    /* =====================================================
       INDICATORS / DOTS
    ===================================================== */

    indicators.forEach((indicator, index) => {
        indicator.addEventListener("click", () => {
            if (index === currentSlide) return;
            const direction = index > currentSlide ? "next" : "prev";
            showSlide(index, direction);
            restartAutoSlide();
        });
    });


    /* =====================================================
       AUTO SLIDER
    ===================================================== */

    function startAutoSlide() {
        clearInterval(autoSlide);
        autoSlide = setInterval(() => {
            if (!isAnimating) showSlide(currentSlide + 1, "next");
        }, 5000);
    }

    function restartAutoSlide() {
        clearInterval(autoSlide);
        startAutoSlide();
    }


    /* =====================================================
       PAUSE ON HOVER
    ===================================================== */

    if (servicesPanel) {
        servicesPanel.addEventListener("mouseenter", () => clearInterval(autoSlide));
        servicesPanel.addEventListener("mouseleave", () => startAutoSlide());
    }


    /* =====================================================
       TOUCH / SWIPE
    ===================================================== */

    let touchStartX = 0;
    let touchEndX   = 0;

    if (servicesPanel) {
        servicesPanel.addEventListener("touchstart", (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        servicesPanel.addEventListener("touchend", (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchEndX - touchStartX;
            if (diff < -50)      nextSlide();
            else if (diff > 50)  previousSlide();
        }, { passive: true });
    }


    /* =====================================================
       CONTACT FORM SUBMIT
    ===================================================== */

    const contactForm = document.getElementById("contactForm");

    if (contactForm) {
        contactForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const name    = document.getElementById("name").value.trim();
            const email   = document.getElementById("email").value.trim();
            const phone   = document.getElementById("phone").value.trim();
            const reason  = document.getElementById("reason").value;
            const message = document.getElementById("message").value.trim();

            if (!name)    { alert("Please enter your name.");      return; }
            if (!email)   { alert("Please enter your email.");     return; }
            if (!reason)  { alert("Please select a reason.");      return; }
            if (!message) { alert("Please enter your message.");   return; }

            const resumeInputEl = document.getElementById("resume");
            if (reason === "Job Requirement" && resumeInputEl && !resumeInputEl.files.length) {
                alert("Please upload your resume.");
                return;
            }

            const waMessage =
                `Hello Tasmafive Solutions,\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "Not provided"}\nService: ${reason}\n\nMessage:\n${message}`;

            const waURL = "https://wa.me/916307558730?text=" + encodeURIComponent(waMessage);

            const formData = new FormData(contactForm);

            try {
                const response = await fetch(
                    "https://formsubmit.co/ajax/tasmafive@gmail.com",
                    { method: "POST", body: formData, headers: { "Accept": "application/json" } }
                );
                const result = await response.json();

                if (result.success) {
                    alert("Your message has been sent successfully!");
                    window.open(waURL, "_blank");
                    contactForm.reset();
                    const resumeGroup = document.getElementById("resumeUploadGroup");
                    if (resumeGroup) resumeGroup.style.display = "none";
                } else {
                    alert("Unable to send your message. Please try again.");
                }
            } catch (error) {
                console.error("Form submission error:", error);
                alert("Something went wrong. Please try again.");
            }
        });
    }


    /* =====================================================
       INITIALIZE
    ===================================================== */

    slides.forEach((slide, i)     => slide.classList.toggle("active",     i === 0));
    indicators.forEach((ind, i)   => ind.classList.toggle("active",       i === 0));

    startAutoSlide();


});
