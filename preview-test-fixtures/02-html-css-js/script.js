(function () {
  var btn = document.getElementById("action");
  var status = document.getElementById("status");
  var n = 0;

  if (!btn || !status) return;

  btn.addEventListener("click", function () {
    n += 1;
    status.textContent = "Button clicked " + n + " time" + (n === 1 ? "" : "s") + ".";
  });
})();
