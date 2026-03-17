(function () {
  "use strict";

  var API = "/api/events";
  var CLARITY_ID = window.__CLARITY_ID || "";

  // ---- Clarity snippet (heatmaps / session recording) ----
  if (CLARITY_ID) {
    (function (c, l, a, r, i, t, y) {
      c[a] =
        c[a] ||
        function () {
          (c[a].q = c[a].q || []).push(arguments);
        };
      t = l.createElement(r);
      t.async = 1;
      t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);
  }

  // ---- Session ID (persisted per tab) ----
  var sid = sessionStorage.getItem("_sid");
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    sessionStorage.setItem("_sid", sid);
  }

  // ---- UTM / referrer ----
  function utmParams() {
    var params = new URLSearchParams(location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
    var out = {};
    keys.forEach(function (k) {
      var v = params.get(k);
      if (v) out[k] = v;
    });
    return out;
  }

  // ---- Send event ----
  function send(eventType, props) {
    var payload = {
      event_type: eventType,
      page_url: location.href,
      referrer: document.referrer || "",
      session_id: sid,
      properties: Object.assign({}, utmParams(), props || {}),
    };

    if (navigator.sendBeacon) {
      navigator.sendBeacon(API, JSON.stringify(payload));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", API, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify(payload));
    }
  }

  // ---- Page view on load ----
  send("page_view", { title: document.title });

  // ---- Public API ----
  window.trackEvent = function (name, props) {
    send(name, props);
  };
})();
