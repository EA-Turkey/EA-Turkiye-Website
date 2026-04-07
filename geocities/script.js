(function () {
  var counterNode = document.querySelector("[data-counter]");
  var statusNode = document.querySelector("[data-status-rotator]");
  var language = document.documentElement.lang || "tr";

  if (counterNode && window.localStorage) {
    var key = "ea-turkiye-geocities-counter";
    var count = Number(window.localStorage.getItem(key) || "7200") + 1;
    window.localStorage.setItem(key, String(count));
    counterNode.textContent = String(count).padStart(6, "0");
  }

  if (statusNode) {
    var messages = language.indexOf("en") === 0
      ? [
          "STATUS: Updating HTML by hand like it is 1999.",
          "STATUS: Optimized for CRT glow and civic ambition.",
          "STATUS: Gathering evidence, reason, and more glitter text.",
          "STATUS: Webring diplomacy in progress."
        ]
      : [
          "DURUM: HTML dosyalari elle guncelleniyor, yil 1999 gibi.",
          "DURUM: CRT pariltisi ve topluluk ruhu icin optimize edildi.",
          "DURUM: Kanit, akil ve biraz daha parlayan yazi toplaniyor.",
          "DURUM: Webring diplomasisi suruyor."
        ];

    var index = 0;
    statusNode.textContent = messages[index];
    window.setInterval(function () {
      index = (index + 1) % messages.length;
      statusNode.textContent = messages[index];
    }, 2600);
  }
})();
