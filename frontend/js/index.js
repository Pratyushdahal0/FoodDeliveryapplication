// Tabs switching
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
  });
});