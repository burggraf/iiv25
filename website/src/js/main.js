// Main JavaScript for Is It Vegan website

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all functionality
    initFAQ();
    initContactForm();
    initNavigation();
    initScrollAnimations();
});

// FAQ Functionality
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        
        question.addEventListener('click', function() {
            const isExpanded = question.getAttribute('aria-expanded') === 'true';
            
            // Close all other FAQ items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    const otherQuestion = otherItem.querySelector('.faq-question');
                    const otherAnswer = otherItem.querySelector('.faq-answer');
                    otherQuestion.setAttribute('aria-expanded', 'false');
                    otherAnswer.classList.remove('active');
                }
            });
            
            // Toggle current item
            if (isExpanded) {
                question.setAttribute('aria-expanded', 'false');
                answer.classList.remove('active');
            } else {
                question.setAttribute('aria-expanded', 'true');
                answer.classList.add('active');
            }
        });
    });
}

// Contact Form Functionality
function initContactForm() {
    const form = document.getElementById('contactForm');
    const formStatus = document.getElementById('formStatus');
    
    if (!form || !formStatus) return;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            email: formData.get('email'),
            subject: formData.get('subject'),
            message: formData.get('message')
        };
        
        // Basic validation
        if (!data.name || !data.email || !data.subject || !data.message) {
            showFormStatus('Please fill in all fields.', 'error');
            return;
        }
        
        if (!isValidEmail(data.email)) {
            showFormStatus('Please enter a valid email address.', 'error');
            return;
        }
        
        // Show loading state
        const submitButton = form.querySelector('.form-submit');
        const originalText = submitButton.textContent;
        submitButton.textContent = 'Sending...';
        submitButton.disabled = true;
        form.classList.add('loading');
        
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                showFormStatus('Thank you for your message! We\'ll get back to you soon.', 'success');
                form.reset();
            } else {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            console.error('Contact form error:', error);
            showFormStatus('Sorry, there was an error sending your message. Please try again.', 'error');
        } finally {
            // Reset form state
            submitButton.textContent = originalText;
            submitButton.disabled = false;
            form.classList.remove('loading');
        }
    });
}

// Show form status messages
function showFormStatus(message, type) {
    const formStatus = document.getElementById('formStatus');
    formStatus.textContent = message;
    formStatus.className = `form-status ${type}`;
    formStatus.style.display = 'block';
    
    setTimeout(() => {
        formStatus.style.display = 'none';
    }, 5000);
}

// Email validation
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Navigation Functionality
function initNavigation() {
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', function() {
            navLinks.classList.toggle('mobile-open');
            navToggle.classList.toggle('active');
        });
    }
    
    // Smooth scrolling for navigation links
    const navLinksElements = document.querySelectorAll('.nav-link[href^="#"]');
    navLinksElements.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = targetElement.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                if (navLinks.classList.contains('mobile-open')) {
                    navLinks.classList.remove('mobile-open');
                    navToggle.classList.remove('active');
                }
            }
        });
    });
    
    // Header scroll effect
    let lastScrollTop = 0;
    const header = document.querySelector('.header');
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            header.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            header.style.transform = 'translateY(0)';
        }
        
        lastScrollTop = scrollTop;
    }, { passive: true });
}

// Scroll Animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    const animateElements = document.querySelectorAll('.feature-card, .screenshot-item, .faq-item');
    animateElements.forEach(el => {
        observer.observe(el);
    });
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Handle image loading errors
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        img.addEventListener('error', function() {
            // Replace with placeholder or hide
            this.style.display = 'none';
            console.warn('Failed to load image:', this.src);
        });
    });
});

// Keyboard navigation support
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Close mobile menu
        const navLinks = document.querySelector('.nav-links');
        const navToggle = document.querySelector('.nav-toggle');
        if (navLinks && navLinks.classList.contains('mobile-open')) {
            navLinks.classList.remove('mobile-open');
            navToggle.classList.remove('active');
        }
        
        // Close any open FAQ items
        const openFaqItems = document.querySelectorAll('.faq-question[aria-expanded="true"]');
        openFaqItems.forEach(question => {
            question.setAttribute('aria-expanded', 'false');
            question.parentElement.querySelector('.faq-answer').classList.remove('active');
        });
    }
});