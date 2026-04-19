// form elements
const form = document.querySelector(".form-box");
const button = form.querySelector("button");

// toast notification
function showToast(messageText, color) {
  const toast = document.createElement("div");

  toast.textContent = messageText;
  toast.style.position = "fixed";
  toast.style.bottom = "30px";
  toast.style.right = "30px";
  toast.style.padding = "14px 22px";
  toast.style.background = color;
  toast.style.color = "#fff";
  toast.style.borderRadius = "12px";
  toast.style.boxShadow = "0 8px 25px rgba(0,0,0,0.2)";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(20px)";
  toast.style.transition = "all 0.4s ease";

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 100);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// shake effect
function shake(el) {
  el.style.transform = "translateX(-5px)";
  setTimeout(() => (el.style.transform = "translateX(5px)"), 100);
  setTimeout(() => (el.style.transform = "translateX(0)"), 200);
}

// form submit
button.addEventListener("click", function (e) {
  e.preventDefault();

  const inputs = form.querySelectorAll("input, textarea");

  let isValid = true;
  let formData = {};

  inputs.forEach((input) => {
    if (input.value.trim() === "") {
      input.style.border = "2px solid red";
      shake(input);
      isValid = false;
    } else {
      input.style.border = "1px solid #ddd";
      formData[input.placeholder] = input.value;
    }
  });

  if (!isValid) {
    showToast("Please fill all field", "#e74c3c");
    return;
  }

  // loading
  button.disabled = true;
  button.innerHTML = "Sending <span class='loader'></span>";

  setTimeout(() => {
    button.disabled = false;
    button.innerHTML = "Send Message";

    ```
localStorage.setItem("contactForm", JSON.stringify(formData));

showToast("Message sent successfully", "#27ae60");

inputs.forEach(input => (input.value = ""));
```;
  }, 1500);
});

// email validation
const emailInput = document.querySelector('input[type="email"]');

emailInput.addEventListener("blur", function () {
  const pattern = /^[^ ]+@[^ ]+.[a-z]{2,3}$/;

  if (!pattern.test(emailInput.value)) {
    emailInput.style.border = "2px solid red";
    shake(emailInput);
  } else {
    emailInput.style.border = "1px solid #ddd";
  }
});

// search filter
const searchBox = document.querySelector(".search-box");

searchBox.addEventListener("keyup", function () {
  const value = searchBox.value.toLowerCase();

  const links = document.querySelectorAll(".nav-links a");

  links.forEach((link) => {
    link.style.display = link.textContent.toLowerCase().includes(value)
      ? "inline-block"
      : "none";
  });
});
