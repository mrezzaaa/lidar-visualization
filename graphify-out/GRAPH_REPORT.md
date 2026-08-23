# Graph Report - lidar-visualization  (2026-08-23)

## Corpus Check
- 29 files · ~22,055 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 329 nodes · 390 edges · 26 communities (21 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6c8a719e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ESLint & Dev Dependencies
- TypeScript Compiler Config
- App & UI Components
- Lidar Data Parser
- Frontend Dependencies
- Lidar Viewer & SLAM
- LidarViewer Lifecycle
- Sidebar & Baud Config
- 3D Constants & Calibration
- Package Scripts
- Vite Build Config
- Serial Handler
- Web Serial API Types
- Docs & Issue Analysis
- React Logo Asset
- Vercel Deployment
- Tailwind Dependency
- 23. Command Packet Reference
- 11. Command Packet Examples

## God Nodes (most connected - your core abstractions)
1. `Parser` - 22 edges
2. `LidarViewer` - 16 edges
3. `compilerOptions` - 16 edges
4. `SLAM` - 11 edges
5. `Point2D` - 9 edges
6. `SerialHandler` - 8 edges
7. `30. Important Implementation Rules` - 8 edges
8. `App()` - 7 edges
9. `23. Command Packet Reference` - 7 edges
10. `compilerOptions` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Cyglidar D1 User Manual` --conceptually_related_to--> `Three.js + React Rendering Issue Analysis`  [INFERRED]
  Cyglidar D1 User Manual.pdf → THREEJS_REACT_ISSUE.md
- `vite.svg (Vite Logo Icon)` --references--> `vite`  [EXTRACTED]
  public/vite.svg → package.json
- `Three.js + React Rendering Issue Analysis` --conceptually_related_to--> `index.html Entry Point`  [INFERRED]
  THREEJS_REACT_ISSUE.md → index.html
- `Three.js + React Rendering Issue Analysis` --conceptually_related_to--> `React + Vite Template`  [INFERRED]
  THREEJS_REACT_ISSUE.md → README.md
- `Sidebar()` --references--> `react`  [EXTRACTED]
  src/components/Sidebar.tsx → package.json

## Import Cycles
- None detected.

## Communities (26 total, 5 thin omitted)

### Community 0 - "ESLint & Dev Dependencies"
Cohesion: 0.08
Nodes (26): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+18 more)

### Community 1 - "TypeScript Compiler Config"
Cohesion: 0.09
Nodes (22): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+14 more)

### Community 2 - "App & UI Components"
Cohesion: 0.11
Nodes (22): App(), FilterType, SlamPostprocessing, ColorMode, DepthMapPreview(), DepthMapPreviewProps, hslToRgb(), DepthMatrixModal() (+14 more)

### Community 4 - "Frontend Dependencies"
Cohesion: 0.10
Nodes (18): autoprefixer, lucide-react, dependencies, autoprefixer, lucide-react, postcss, react, react-dom (+10 more)

### Community 5 - "Lidar Viewer & SLAM"
Cohesion: 0.11
Nodes (15): LidarViewerProps, TODO: Swap geometry logic if needed, angleCamera, getAngle(), initDistortion3D(), interpolate(), realImageSize, tablex (+7 more)

### Community 7 - "Sidebar & Baud Config"
Cohesion: 0.05
Nodes (41): 10. Commands, 12. 2D Data, 13. 2D Error Codes, 14. 2D Resolution Discrepancy, 15. 3D Data, 16. 3D Data Packing, 17. 3D Frame Size, 18. 3D Matrix (+33 more)

### Community 8 - "3D Constants & Calibration"
Cohesion: 0.05
Nodes (36): 10. Parsing 2D Data, 11. Run 3D Mode, 12. 3D Data Layout, 13. 3D 12-bit Packing, 14. 3D Parser, 15. 3D Error Values, 16. Run Dual Mode, 17. Stop (+28 more)

### Community 9 - "Package Scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 10 - "Vite Build Config"
Cohesion: 0.22
Nodes (8): vite.config.ts, compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 12 - "Web Serial API Types"
Cohesion: 0.25
Nodes (3): Navigator, Serial, SerialPort

### Community 13 - "Docs & Issue Analysis"
Cohesion: 0.33
Nodes (6): Cyglidar D1 User Manual, index.html Entry Point, React + Vite Template, Three.js + React Rendering Issue Analysis, React Strict Mode Root Cause, vanilla-backup Approach

### Community 20 - "Tailwind Dependency"
Cohesion: 0.25
Nodes (8): 30. Important Implementation Rules, Rule 1 — Jangan hard-code frame size, Rule 2 — Selalu validasi header, Rule 3 — Selalu validasi checksum, Rule 4 — UART adalah stream, Rule 5 — Gunakan Payload Header untuk menentukan decoder, Rule 6 — 3D menggunakan 12-bit packed data, Rule 7 — 3D expected size

### Community 23 - "23. Command Packet Reference"
Cohesion: 0.29
Nodes (7): 23. Command Packet Reference, Get Device Info, Run 2D, Run 3D, Run Dual, Set Frequency Channel, Stop

### Community 25 - "11. Command Packet Examples"
Cohesion: 0.33
Nodes (6): 11. Command Packet Examples, Get Device Info, Run 2D, Run 3D, Run Dual, Stop

## Knowledge Gaps
- **165 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+160 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Frontend Dependencies` to `Package Scripts`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Why does `Sidebar()` connect `Frontend Dependencies` to `App & UI Components`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _165 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ESLint & Dev Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `TypeScript Compiler Config` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `App & UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.1051693404634581 - nodes in this community are weakly interconnected._
- **Should `Frontend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._