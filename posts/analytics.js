(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────────
  // Replace placeholder values with real IDs after signing up.
  var CONFIG = {
    GA4_ID: "G-XXXXXXXXXX",
    CLARITY_ID: "XXXXXXXXXX",
    PLAUSIBLE_DOMAIN: "jdetle.com",
    POSTHOG_KEY: "phc_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    POSTHOG_HOST: "https://us.i.posthog.com",
  };

  // ── UTM + Referrer Tracking ────────────────────────────────────────
  var UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ];

  function captureReferral() {
    try {
      var params = new URLSearchParams(window.location.search);
      var utmData = {};
      var hasUtm = false;

      UTM_KEYS.forEach(function (key) {
        var val = params.get(key);
        if (val) {
          utmData[key] = val;
          hasUtm = true;
        }
      });

      if (hasUtm) {
        sessionStorage.setItem("_utm", JSON.stringify(utmData));
      }

      var ref = document.referrer;
      if (ref && !sessionStorage.getItem("_referrer")) {
        sessionStorage.setItem("_referrer", ref);
        sessionStorage.setItem(
          "_referrer_class",
          classifyReferrer(ref)
        );
      }
    } catch (_) {
      /* storage unavailable */
    }
  }

  function classifyReferrer(url) {
    try {
      var host = new URL(url).hostname.toLowerCase();
    } catch (_) {
      return "other";
    }
    if (
      host.includes("google.") ||
      host.includes("bing.com") ||
      host.includes("duckduckgo.com") ||
      host.includes("yahoo.com") ||
      host.includes("baidu.com")
    )
      return "search";
    if (
      host.includes("twitter.com") ||
      host.includes("x.com") ||
      host.includes("t.co")
    )
      return "social:twitter";
    if (host.includes("linkedin.com")) return "social:linkedin";
    if (host.includes("reddit.com")) return "social:reddit";
    if (host.includes("news.ycombinator.com")) return "social:hackernews";
    if (host.includes("facebook.com") || host.includes("fb.com"))
      return "social:facebook";
    if (host.includes("github.com")) return "social:github";
    return "other:" + host;
  }

  // ── Google Analytics 4 ─────────────────────────────────────────────
  function initGA4() {
    if (CONFIG.GA4_ID.indexOf("X") !== -1) return;

    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + CONFIG.GA4_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", CONFIG.GA4_ID, {
      send_page_view: true,
    });

    try {
      var utm = JSON.parse(sessionStorage.getItem("_utm") || "{}");
      if (utm.utm_source) {
        gtag("event", "campaign_details", {
          campaign_source: utm.utm_source,
          campaign_medium: utm.utm_medium || "",
          campaign_name: utm.utm_campaign || "",
          campaign_term: utm.utm_term || "",
          campaign_content: utm.utm_content || "",
        });
      }
      var refClass = sessionStorage.getItem("_referrer_class");
      if (refClass) {
        gtag("event", "referrer_classified", {
          referrer_class: refClass,
          referrer_raw: sessionStorage.getItem("_referrer") || "",
        });
      }
    } catch (_) {}
  }

  // ── Microsoft Clarity ──────────────────────────────────────────────
  function initClarity() {
    if (CONFIG.CLARITY_ID.indexOf("X") !== -1) return;

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
    })(window, document, "clarity", "script", CONFIG.CLARITY_ID);
  }

  // ── Plausible Analytics ────────────────────────────────────────────
  function initPlausible() {
    if (!CONFIG.PLAUSIBLE_DOMAIN) return;

    var s = document.createElement("script");
    s.defer = true;
    s.setAttribute("data-domain", CONFIG.PLAUSIBLE_DOMAIN);
    s.src = "https://plausible.io/js/script.js";
    document.head.appendChild(s);

    window.plausible =
      window.plausible ||
      function () {
        (window.plausible.q = window.plausible.q || []).push(arguments);
      };
  }

  // ── PostHog ────────────────────────────────────────────────────────
  function initPostHog() {
    if (CONFIG.POSTHOG_KEY.indexOf("X") !== -1) return;

    !(function (t, e) {
      var o, n, p, r;
      e.__SV ||
        ((window.posthog = e),
        (e._i = []),
        (e.init = function (i, s, a) {
          function g(t, e) {
            var o = e.split(".");
            2 == o.length && ((t = t[o[0]]), (e = o[1]));
            t[e] = function () {
              t.push(
                [e].concat(Array.prototype.slice.call(arguments, 0))
              );
            };
          }
          ((p = t.createElement("script")).type = "text/javascript"),
            (p.crossOrigin = "anonymous"),
            (p.async = !0),
            (p.src =
              s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") +
              "/static/array.js"),
            (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(
              p,
              r
            );
          var u = e;
          for (
            void 0 !== a ? (u = e[a] = []) : (a = "posthog"),
              u.people = u.people || [],
              u.toString = function (t) {
                var e = "posthog";
                return (
                  "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e
                );
              },
              u.people.toString = function () {
                return u.toString(1) + ".people (stub)";
              },
              o =
                "init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(
                  " "
                ),
              n = 0;
            n < o.length;
            n++
          )
            g(u, o[n]);
          e._i.push([i, s, a]);
        }),
        (e.__SV = 1));
    })(document, window.posthog || []);

    window.posthog.init(CONFIG.POSTHOG_KEY, {
      api_host: CONFIG.POSTHOG_HOST,
      person_profiles: "identified_only",
    });

    try {
      var utm = JSON.parse(sessionStorage.getItem("_utm") || "{}");
      if (utm.utm_source) {
        window.posthog.register({
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium || "",
          utm_campaign: utm.utm_campaign || "",
        });
      }
      var refClass = sessionStorage.getItem("_referrer_class");
      if (refClass) {
        window.posthog.register({
          referrer_class: refClass,
          referrer_raw: sessionStorage.getItem("_referrer") || "",
        });
      }
    } catch (_) {}
  }

  // ── Vercel Analytics ───────────────────────────────────────────────
  function initVercelAnalytics() {
    var s = document.createElement("script");
    s.defer = true;
    s.src = "/_vercel/insights/script.js";
    document.head.appendChild(s);
  }

  // ── Boot ───────────────────────────────────────────────────────────
  captureReferral();
  initGA4();
  initClarity();
  initPlausible();
  initPostHog();
  initVercelAnalytics();
})();
