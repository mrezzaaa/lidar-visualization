import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { LidarViewer } from './components/LidarViewer';
import { DepthMatrixModal } from './components/DepthMatrixModal';
import { DepthMapPreview } from './components/DepthMapPreview';
import { SerialHandler } from './logic/SerialHandler';
import { Parser, Point2D, DeviceInfo, ParserMode } from './logic/Parser';
import { SLAM } from './logic/SLAM';
import { CMD } from './logic/utils';
import { getBaudCommand } from './logic/BaudRateUtils';
import { applySOR, applyROR, applyMLS, applyDBSCAN, applyPointCleanNet, applyVoxelGrid } from './logic/Filters';

type SlamPostprocessing = 'None' | 'VoxelGrid' | 'SOR';

export type FilterType = 'NONE' | 'SOR' | 'ROR' | 'MLS' | 'DBSCAN' | 'NET';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [frames, setFrames] = useState(0);
  const [points2D, setPoints2D] = useState<Point2D[]>([]);
  const [points3D, setPoints3D] = useState<Float32Array | null>(null);
  const [rawDistances, setRawDistances] = useState<Uint16Array | null>(null);
  const [meshMode, setMeshMode] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterType>('NONE');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [parserMode, setParserMode] = useState<ParserMode>('bitshift');
  const [slamActive, setSlamActive] = useState(false);
  const [slamUpdateTrigger, setSlamUpdateTrigger] = useState(0); // Force re-render when SLAM updates
  const [slamPostprocessing, setSlamPostprocessing] = useState<SlamPostprocessing>('None');
  const [showMatrixModal, setShowMatrixModal] = useState(false);

  const serialRef = useRef<SerialHandler>(new SerialHandler());
  const parserRef = useRef<Parser | null>(null);
  const slamRef = useRef(new SLAM({ maxPoints: 50000 })); // Max 50k accumulated points

  const latest2D = useRef<Point2D[] | null>(null);
  const latest3D = useRef<Float32Array | null>(null);
  const latestDist = useRef<Uint16Array | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    // Initialize Parser calling Refs
    parserRef.current = new Parser({
      on2D: (points) => {
        latest2D.current = points;
        // SLAM now uses filtered points (moved to useEffect)
        dirtyRef.current = true;
      },
      on3D: (points, distances) => {
        latest3D.current = points;
        latestDist.current = distances;
        dirtyRef.current = true;
      },
      onInfo: (info) => {
        setDeviceInfo(info);
      }
    });

    // Link Serial -> Parser
    serialRef.current.onData = (data) => {
      parserRef.current?.pushData(data);
    };

    serialRef.current.onDisconnect = () => setIsConnected(false);

    // Render Loop (Decoupled from Serial)
    let animationFrameId: number;
    const renderLoop = () => {
        if (dirtyRef.current) {
            // Apply Filters to 2D Data before setting state
            if (latest2D.current) {
                let filtered = latest2D.current;
                console.log(`[App] Received ${filtered.length} points from parser. Filter: ${filterMode}`);
                
                // Note: Only apply filters if we have enough points
                if (filtered.length > 10) {
                    switch (filterMode) {
                        case 'SOR': filtered = applySOR(filtered); break;
                        case 'ROR': filtered = applyROR(filtered); break;
                        case 'MLS': filtered = applyMLS(filtered); break;
                        case 'DBSCAN': filtered = applyDBSCAN(filtered); break;
                        case 'NET': filtered = applyPointCleanNet(filtered); break;
                    }
                }
                
                console.log(`[App] After filter: ${filtered.length} points. Setting state.`);
                setPoints2D(filtered);
                
                // Add filtered points to SLAM if mapping is active (use ref not state to avoid closure issues)
                const isSlamActive = slamRef.current.isActive();
                console.log('[App] SLAM isActive:', isSlamActive, 'filtered points:', filtered.length);
                if (isSlamActive) {
                    slamRef.current.addScan(filtered);
                    const totalSlamPoints = slamRef.current.getPointCount();
                    console.log('[App] Added to SLAM. Total accumulated:', totalSlamPoints);
                    // Force re-render by updating trigger
                    setSlamUpdateTrigger(prev => {
                        console.log('[App] slamUpdateTrigger:', prev, '->', prev + 1);
                        return prev + 1;
                    });
                }
            }

            if (latest3D.current) {
                setPoints3D(latest3D.current);
                setRawDistances(latestDist.current);
            }
            dirtyRef.current = false;
        }
        
        // Also update FPS from parser
        if (parserRef.current && parserRef.current.frames > 0) {
             setFrames(parserRef.current.frames); 
        }
        
        animationFrameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    // FPS Counter Interval
    const interval = setInterval(() => {
      if (parserRef.current) {
        setFrames(parserRef.current.frames);
        parserRef.current.frames = 0;
      }
    }, 1000);

    return () => {
        clearInterval(interval);
        cancelAnimationFrame(animationFrameId);
    };
  }, [filterMode]); // Re-bind renderLoop when filterMode changes to capture new state

  // Update parser mode when changed
  useEffect(() => {
    if (parserRef.current) {
      parserRef.current.setParserMode(parserMode);
      console.log('[App] Parser mode changed to:', parserMode);
    }
    // Also update SerialHandler to convert data at read level
    serialRef.current.setHexMode(parserMode === 'hexstring');
  }, [parserMode]);

  const handleConnect = async (baudRate: number) => {
    try {
      await serialRef.current.connect(baudRate);
      setIsConnected(true);
    } catch (e) {
      alert("Failed to connect: " + e);
    }
  };

  const handleDisconnect = async () => {
    await serialRef.current.disconnect();
    setIsConnected(false);
  };

  const handleCommand = async (cmd: Uint8Array) => {
    // Log command being sent
    const hexString = Array.from(cmd).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`[Serial] Sending command: 0x${hexString}`);
    await serialRef.current.send(cmd);
  };

  const handleExportCSV = () => {
      if (!rawDistances) {
          alert("No 3D data available to export.");
          return;
      }

      let csv = 'Row';
      for (let c = 0; c < 160; c++) csv += `,C${c}`;
      csv += '\n';

      for (let r = 0; r < 60; r++) {
          csv += `R${r}`;
          for (let c = 0; c < 160; c++) {
              const idx = c + (r * 160);
              const dist = rawDistances[idx];
              csv += `,${dist >= 4080 ? 0 : dist}`;
          }
          csv += '\n';
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lidar_scan_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  // SLAM Handlers
  const handleStartMapping = () => {
      slamRef.current.start();
      setSlamActive(true);
  };

  const handleStopMapping = () => {
      slamRef.current.stop();
      setSlamActive(false);
  };

  const handleResetMap = () => {
      slamRef.current.reset();
  };

  const handleTestFlatGrid = () => {
      if (parserRef.current) {
          parserRef.current.generateTestFlatGrid();
      } else {
          alert('Parser not initialized');
      }
  };

  const handleChangeBaudRate = async (newBaud: number) => {
    if (!isConnected) {
      alert('Please connect first before changing baud rate');
      return;
    }

    const baudCmd = getBaudCommand(newBaud);
    if (!baudCmd) {
      alert(`Invalid baud rate: ${newBaud}`);
      return;
    }

    console.log(`[App] Changing baud rate to ${newBaud}...`);
    
    try {
      console.log('[App] Step 1: Sending SET_BAUDRATE command...');
      await serialRef.current.send(baudCmd);
      
      console.log('[App] Step 2: Waiting for sensor...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('[App] Step 3: Disconnecting...');
      await handleDisconnect();
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log(`[App] Step 4: Reconnecting with baud ${newBaud}...`);
      await handleConnect(newBaud);
      
      console.log('[App] Baud rate changed successfully');
    } catch (error) {
      console.error('[App] Failed to change baud rate:', error);
      alert(`Failed to change baud rate: ${error}`);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden">
      <Sidebar 
        isConnected={isConnected}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onCommand={handleCommand}
        onExportCSV={handleExportCSV}
        onToggleMesh={() => setMeshMode(!meshMode)}
        onTestFlatGrid={handleTestFlatGrid}
        onShowMatrix={() => setShowMatrixModal(true)}
        onChangeBaudRate={handleChangeBaudRate}
        meshMode={meshMode}
        frames={frames}
        points={points2D.length || (points3D ? 9600 : 0)}
        rawDistances={rawDistances}
        deviceInfo={deviceInfo}
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        parserMode={parserMode}
        setParserMode={setParserMode}
        slamActive={slamActive}
        onStartMapping={handleStartMapping}
        onStopMapping={handleStopMapping}
        onResetMap={handleResetMap}
        slamPostprocessing={slamPostprocessing}
        onSlamPostprocessingChange={(mode) => setSlamPostprocessing(mode as SlamPostprocessing)}
      />
      
      <main className="flex-1 flex flex-col relative">
        <LidarViewer 
          points2D={points2D} 
          points3D={points3D} 
          meshMode={meshMode}
          slamPoints={(() => {
            let processed = [...slamRef.current.getPoints()];
            // Apply postprocessing filter
            if (slamPostprocessing === 'VoxelGrid') {
              processed = applyVoxelGrid(processed, 0.1);
            } else if (slamPostprocessing === 'SOR') {
              processed = applySOR(processed, 5, 1.0);
            }
            return processed;
          })()}
        />
        
        {/* Connection Status Overlay */}
        {!isConnected && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                <div className="bg-gray-900 border border-gray-700 px-6 py-4 rounded-lg shadow-2xl">
                    <p className="text-gray-400">Device Disconnected</p>
                </div>
            </div>
        )}
      </main>
      
      
      {/* Depth Map Preview - Bottom Right Overlay */}
      {rawDistances && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg p-2 shadow-2xl">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">Depth Map</h3>
            <DepthMapPreview depthData={rawDistances} />
          </div>
        </div>
      )}

      {/* Depth Matrix Modal */}
      <DepthMatrixModal 
        isOpen={showMatrixModal}
        onClose={() => setShowMatrixModal(false)}
        depthData={rawDistances}
      />
    </div>
  );
}

export default App;
