// dsh-fabric client half — the capability-graph settings section.
// Loaded as a classic script by the client-modules bundle route; the factory
// returns a standard Cordis plugin { apply, inject }.
window.__ModuleLoader__.load({
  id: "dsh-fabric",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    var inject = ["slots"];

    function statCard(label, value) {
      return React.createElement(
        "div",
        { style: { minWidth: "120px", padding: "12px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: "8px" } },
        React.createElement("div", { style: { fontSize: "24px", fontWeight: 700 } }, String(value)),
        React.createElement("div", { style: { fontSize: "12px", color: "#888" } }, label)
      );
    }

    function FabricSection() {
      var censusState = React.useState(null);
      var census = censusState[0];
      var setCensus = censusState[1];
      var errState = React.useState(null);
      var error = errState[0];
      var setError = errState[1];

      function loadData() {
        fetch("/fabric/census")
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function (data) { setCensus(data); setError(null); })
          .catch(function (e) { setError(String((e && e.message) || e)); });
      }

      React.useEffect(function () {
        var cancelled = false;
        function first() {
          fetch("/fabric/census")
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(function (data) { if (!cancelled) { setCensus(data); setError(null); } })
            .catch(function (e) { if (!cancelled) setError(String((e && e.message) || e)); });
        }
        first();
        return function () { cancelled = true; };
      }, []);

      var seams = census && census.seams ? census.seams : [];
      var extensions = census && census.fabricExtensions ? census.fabricExtensions : [];

      return React.createElement(
        "div",
        { style: { padding: "20px", display: "flex", flexDirection: "column", gap: "16px" } },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          React.createElement("h2", { style: { margin: 0 } }, "Fabric — capability graph"),
          React.createElement("button", { onClick: loadData, style: { padding: "6px 12px", cursor: "pointer" } }, "Refresh")
        ),
        error ? React.createElement("div", { style: { color: "#c0392b" } }, "Error: " + error) : null,
        census
          ? React.createElement(
              "div",
              { style: { display: "flex", gap: "16px", flexWrap: "wrap" } },
              statCard("Tools", census.tools),
              statCard("Skills", census.skills),
              statCard("Fabric extensions", census.fabricExtensions)
            )
          : React.createElement("div", null, "Loading…"),
        React.createElement(
          "div",
          null,
          React.createElement("h3", null, "Extension seams (" + seams.length + ")"),
          React.createElement(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
            seams.map(function (s) {
              return React.createElement(
                "span",
                { key: s, style: { padding: "2px 8px", borderRadius: "12px", background: "rgba(120,120,220,0.15)", fontSize: "12px", fontFamily: "monospace" } },
                s
              );
            })
          )
        ),
        extensions.length > 0
          ? React.createElement(
              "div",
              null,
              React.createElement("h3", null, "Registered extensions (" + extensions.length + ")"),
              extensions.map(function (ext) {
                return React.createElement(
                  "div",
                  { key: ext.id, style: { fontFamily: "monospace", fontSize: "12px", padding: "2px 0" } },
                  ext.id + "  " + ext.kind + (ext.name ? "  ·  " + ext.name : "") + (ext.event ? "  ·  " + ext.event : "")
                );
              })
            )
          : null
      );
    }

    function apply(ctx) {
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          {
            name: "settings.section",
            id: "fabric",
            order: 60,
            label: "Fabric",
          },
          FabricSection
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
