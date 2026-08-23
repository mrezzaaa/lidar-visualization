# Graph Report - lidar-visualization  (2026-08-23)

## Corpus Check
- Corpus is ~13,091 words - fits in a single context window. You may not need a graph.

## Summary
- 214 nodes · 276 edges · 22 communities (17 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `Parser` - 20 edges
2. `LidarViewer` - 16 edges
3. `compilerOptions` - 16 edges
4. `SLAM` - 11 edges
5. `Point2D` - 9 edges
6. `App()` - 8 edges
7. `SerialHandler` - 8 edges
8. `compilerOptions` - 6 edges
9. `scripts` - 5 edges
10. `applySOR()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Cyglidar D1 User Manual` --conceptually_related_to--> `Three.js + React Rendering Issue Analysis`  [INFERRED]
  Cyglidar D1 User Manual.pdf → THREEJS_REACT_ISSUE.md
- `vite.svg (Vite Logo Icon)` --references--> `vite`  [EXTRACTED]
  public/vite.svg → package.json
- `Three.js + React Rendering Issue Analysis` --conceptually_related_to--> `React + Vite Template`  [INFERRED]
  THREEJS_REACT_ISSUE.md → README.md
- `Three.js + React Rendering Issue Analysis` --conceptually_related_to--> `index.html Entry Point`  [INFERRED]
  THREEJS_REACT_ISSUE.md → index.html
- `LidarViewerProps` --references--> `Point2D`  [EXTRACTED]
  src/components/LidarViewer.tsx → src/logic/Parser.ts

## Import Cycles
- None detected.

## Communities (22 total, 5 thin omitted)

### Community 0 - "ESLint & Dev Dependencies"
Cohesion: 0.08
Nodes (26): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+18 more)

### Community 1 - "TypeScript Compiler Config"
Cohesion: 0.09
Nodes (22): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+14 more)

### Community 2 - "App & UI Components"
Cohesion: 0.17
Nodes (17): App(), FilterType, SlamPostprocessing, ColorMode, DepthMapPreview(), DepthMapPreviewProps, hslToRgb(), DepthMatrixModal() (+9 more)

### Community 4 - "Frontend Dependencies"
Cohesion: 0.12
Nodes (17): autoprefixer, lucide-react, dependencies, autoprefixer, lucide-react, postcss, react, react-dom (+9 more)

### Community 5 - "Lidar Viewer & SLAM"
Cohesion: 0.17
Nodes (5): LidarViewerProps, TODO: Swap geometry logic if needed, Point2D, SLAM, SLAMConfig

### Community 7 - "Sidebar & Baud Config"
Cohesion: 0.19
Nodes (6): Sidebar(), SidebarProps, NOTE: Setting baud rate stores value in flash ROM and reboots device!, SUPPORTED_BAUD_RATES, ParserMode, CMD

### Community 8 - "3D Constants & Calibration"
Cohesion: 0.22
Nodes (11): angleCamera, getAngle(), initDistortion3D(), interpolate(), PIXEL_REAL_SIZE, realImageSize, tablex, tabley (+3 more)

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

## Knowledge Gaps
- **73 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+68 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Parser` connect `Lidar Data Parser` to `3D Constants & Calibration`, `App & UI Components`, `Sidebar & Baud Config`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `LidarViewer` connect `LidarViewer Lifecycle` to `App & UI Components`, `Lidar Viewer & SLAM`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `ESLint & Dev Dependencies` to `Package Scripts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _73 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ESLint & Dev Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `TypeScript Compiler Config` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Frontend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._