document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("supportTicketForm");
  const submitBtn = document.getElementById("supportSubmitBtn");
  const statusText = document.getElementById("supportStatus");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      user_type: document.getElementById("userType")?.value || "guest",
      user_id: document.getElementById("userId")?.value || "",

      first_name: document.getElementById("firstName")?.value.trim() || "",
      last_name: document.getElementById("lastName")?.value.trim() || "",
      email: document.getElementById("email")?.value.trim() || "",
      phone: document.getElementById("phone")?.value.trim() || "",

      issue_type: document.getElementById("issueType")?.value || "",
      issue_title: document.getElementById("issueTitle")?.value.trim() || "",
      message: document.getElementById("message")?.value.trim() || "",

      related_order_id:
        document.getElementById("relatedOrderId")?.value.trim() || "",
      related_restaurant_id:
        document.getElementById("relatedRestaurantId")?.value || "",
      related_rider_id: document.getElementById("relatedRiderId")?.value || "",

      source_page: "public_contact_page",
    };

    if (
      !payload.first_name ||
      !payload.email ||
      !payload.issue_type ||
      !payload.issue_title ||
      !payload.message
    ) {
      showStatus("Please fill all required fields.", "error");
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
      showStatus("Sending your message...", "loading");

      const response = await fetch(
        "../../backend/controllers/SupportTicketController.php",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const text = await response.text();

      let result;
      try {
        result = JSON.parse(text);
      } catch (error) {
        console.error("Raw server response:", text);
        throw new Error("Server did not return valid JSON.");
      }

      if (!result.success) {
        showStatus(result.message || "Could not send your message.", "error");
        return;
      }

      showStatus(
        `Message sent successfully. Reference number: ${result.ticket_number}.`,
        "success"
      );

      form.reset();

      document.getElementById("userType").value = "guest";
      document.getElementById("userId").value = "";
      document.getElementById("relatedRestaurantId").value = "";
      document.getElementById("relatedRiderId").value = "";
    } catch (error) {
      console.error("Contact support error:", error);
      showStatus(
        error.message || "Something went wrong while sending your message.",
        "error"
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  });

  function showStatus(message, type) {
    if (!statusText) return;

    statusText.textContent = message;
    statusText.className = "";

    if (type === "success") {
      statusText.classList.add("support-status-success");
    } else if (type === "error") {
      statusText.classList.add("support-status-error");
    } else if (type === "loading") {
      statusText.classList.add("support-status-loading");
    }
  }
});