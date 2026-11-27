# The figure of the chapter Telemetry, docs/book/images/telemetry-weight.svg: the bytes each library of telemetry adds to a page, with
# Brotli at 11, as measured (esbuild 0.28.2, minified). python3 -I bench/telemetry-weight-svg.py docs/book/images/telemetry-weight.svg,
# and with fr as its second argument, the French one of docs/fr/book/images.
import sys
fr = len(sys.argv) > 2 and sys.argv[2] == 'fr'
rows = [("Centauri's telemetry (telemetry.js + its WebAssembly)", 6672, True), ("web-vitals 6.2.3, alone", 3009, False),
        ("Elastic APM RUM 5.17.5", 20933, False), ("Sentry 11.19, errors only", 28809, False),
        ("OpenTelemetry JS for the web 3.1", 32741, False), ("Grafana Faro 2.15", 37893, False),
        ("Sentry 11.19, with tracing", 49999, False), ("Datadog RUM 7.19", 74914, False),
        ("Grafana Faro 2.15, with tracing", 78963, False), ("Sentry 11.19, its quick start (tracing, replay)", 85532, False)]
W, left, scale = 760, 330, 330 / 90000
h = 70 + 30 * len(rows) + 20
out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}">',
       '<title>' + ("Les octets que chaque bibliothèque de télémétrie ajoute à une page, avec Brotli" if fr else "The bytes each library of telemetry adds to a page, with Brotli") + '</title>',
       '<style>text{font-family:system-ui, sans-serif;font-size:12px;fill:#1f2328}.h{font-weight:600;font-size:13px}.s{fill:#57606a}.b{fill:#ebfbee;stroke:#2f9e44}.g{fill:#fff4e6;stroke:#e8590c}</style>',
       f'<rect width="{W}" height="{h}" fill="#fff"/>',
       '<text class="h" x="16" y="24">' + ("Ce qu’une page charge pour sa télémétrie : octets avec Brotli (qualité 11)" if fr else "What a page loads to tell its telemetry: bytes with Brotli (quality 11)") + '</text>',
       '<text class="s" x="16" y="42">' + ("chaque bibliothèque comme son démarrage rapide la met en place, regroupée par esbuild, minifiée ; mesuré le 27/11/2026" if fr else "each library as its quick start sets it up, bundled by esbuild, minified; measured on 2026-11-27") + '</text>']
names_fr = {"Centauri's telemetry (telemetry.js + its WebAssembly)": "La télémétrie de Centauri (telemetry.js + son WebAssembly)", "web-vitals 6.2.3, alone": "web-vitals 6.2.3, seul",
  "Sentry 11.19, errors only": "Sentry 11.19, erreurs seules", "OpenTelemetry JS for the web 3.1": "OpenTelemetry JS pour le web 3.1", "Sentry 11.19, with tracing": "Sentry 11.19, avec le tracing",
  "Grafana Faro 2.15, with tracing": "Grafana Faro 2.15, avec le tracing", "Sentry 11.19, its quick start (tracing, replay)": "Sentry 11.19, son démarrage rapide (tracing, replay)"}
y = 70
for name, b, ours in rows:
    out.append(f'<text x="16" y="{y + 12}">{names_fr.get(name, name) if fr else name}</text>')
    out.append(f'<rect class="{"b" if ours else "g"}" x="{left}" y="{y}" width="{max(2, b * scale):.1f}" height="16" rx="2"/>')
    out.append(f'<text x="{left + b * scale + 8:.1f}" y="{y + 12}">{(f"{b / 1000:.1f}".replace(".", ",") + " Ko") if fr else f"{b / 1000:.1f} KB"}</text>')
    y += 30
out.append('</svg>')
open(sys.argv[1], 'w').write('\n'.join(out) + '\n')
