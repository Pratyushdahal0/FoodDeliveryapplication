document.addEventListener("DOMContentLoaded", () => {
  const contactForm = document.getElementById("contactForm");
  const submitBtn = document.getElementById("contactSubmitBtn");
  const formMessage = document.getElementById("contactFormMessage");

  if (!contactForm) return;

  function showMessage(message, type = "success") {
    formMessage.textContent = message;
    formMessage.className = `contact-form-message ${type}`;
  }

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      firstName: document.getElementById("firstName")?.value.trim() || "",
      lastName: document.getElementById("lastName")?.value.trim() || "",
      email: document.getElementById("email")?.value.trim() || "",
      phone: document.getElementById("phone")?.value.trim() || "",
      subject: document.getElementById("subject")?.value.trim() || "",
      message: document.getElementById("message")?.value.trim() || "",
    };

    if (!payload.firstName || !payload.lastName || !payload.email || !payload.subject || !payload.message) {
      showMessage("Please fill all required fields.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    showMessage("", "");

    try {
      const response = await fetch("../../backend/controllers/ContactController.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();

      let result;
      try {
        result = JSON.parse(text);
      } catch (parseError) {
        console.error("Raw server response:", text);
        throw new Error("Server did not return valid JSON.");
      }

      if (!response.ok) {
        throw new Error(result.message || "Request failed.");
      }

      if (result.success) {
        showMessage(result.message || "Message submitted successfully.", "success");
        contactForm.reset();
      } else {
        showMessage(result.message || "Failed to save your message.", "error");
      }
    } catch (error) {
      console.error("Contact submit error:", error);
      showMessage(error.message || "Something went wrong while sending your message.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  });
});