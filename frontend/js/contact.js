// form elements
const form = document.querySelector(".form-box");
const button = form.querySelector("button");

// toast notification
function showToast(messageText, color) {
  const toast = document.createElement("div");

  toast.textContent = messageText;

  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.padding = "12px 20px";
  toast.style.background = color;
  toast.style.color = "#fff";
  toast.style.borderRadius = "10px";
  toast.style.boxShadow = "0 5px 15px rgba(0,0,0,0.2)";
  toast.style.zIndex = "1000";

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
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
      isValid = false;
    } else {
      input.style.border = "1px solid #ddd";
      formData[input.placeholder] = input.value;
    }
  });

  if (!isValid) {
    showToast("Please fill all fields", "red");
    return;
  }

  // loading effect
  button.textContent = "Sending...";
  button.disabled = true;

  setTimeout(() => {
    button.textContent = "Send Message";
    button.disabled = false;

    ```
// save data
localStorage.setItem("contactForm", JSON.stringify(formData));

showToast("Message sent successfully", "green");

inputs.forEach(input => {
  input.value = "";
});
```;
  }, 1500);
});

// email validation
const emailInput = document.querySelector('input[type="email"]');

emailInput.addEventListener("blur", function () {
  const pattern = /^[^ ]+@[^ ]+.[a-z]{2,3}$/;

  if (!pattern.test(emailInput.value)) {
    emailInput.style.border = "2px solid red";
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
