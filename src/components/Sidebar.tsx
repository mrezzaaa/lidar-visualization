import React from 'react';
import { Play, Square, Activity, Cpu } from 'lucide-react';
import { CMD } from '../logic/utils';
import { ParserMode } from '../logic/Parser';

interface SidebarProps {
    isConnected: boolean;
    onConnect: (baud: number) => void;
    onDisconnect: () => void;
    onCommand: (cmd: Uint8Array) => void;
    onExportCSV: () => void;
    onToggleMesh: () => void;
    onTestFlatGrid: () => void;
    onShowMatrix: () => void;
    onChangeBaudRate: (newBaud: number) => void;
    meshMode: boolean;
    frames: number;
    points: number;
    rawDistances: Uint16Array | null;
    deviceInfo: { ver: string; hw: string } | null;
    filterMode: string;
    setFilterMode: (mode: any) => void;
    parserMode: ParserMode;
    setParserMode: (mode: ParserMode) => void;
    slamActive: boolean;
    onStartMapping: () => void;
    onStopMapping: () => void;
    onResetMap: () => void;
    slamPostprocessing: string;
    onSlamPostprocessingChange: (mode: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
    isConnected, onConnect, onDisconnect, onCommand, onExportCSV, onToggleMesh, onTestFlatGrid, onShowMatrix, onChangeBaudRate, meshMode, frames, points, rawDistances, deviceInfo, 
    filterMode, setFilterMode, parserMode, setParserMode,
    slamActive, onStartMapping, onStopMapping, onResetMap, slamPostprocessing, onSlamPostprocessingChange
}) => {
    const [scanMode, setScanMode] = React.useState<'2D' | '3D' | 'Dual'>('2D');
    const [baudRate, setBaudRate] = React.useState(3000000);
    const [showBaudModal, setShowBaudModal] = React.useState(false);
    const [sensitivity, setSensitivity] = React.useState(20);
    const [frequencyChannel, setFrequencyChannel] = React.useState(0);
    const [pulseMode, setPulseMode] = React.useState<'auto' | 'fixed'>('auto');
    const [pulseDuration, setPulseDuration] = React.useState(5000); // in microseconds

    const FILTERS = [
        { id: 'NONE', label: 'Raw Data' },
        { id: 'SOR', label: 'Statistical Outlier (SOR)' },
        { id: 'ROR', label: 'Radius Outlier (ROR)' },
        { id: 'MLS', label: 'Smooth (MLS)' },
        { id: 'DBSCAN', label: 'Cluster (DBSCAN)' },
        { id: 'NET', label: 'PointCleanNet (AI)' },
    ];

    const handleConnect = () => {
        if (isConnected) onDisconnect();
        else onConnect(baudRate);
    };

    const handleStart = async () => {
        // For 3D mode, send setup commands first
        if (scanMode === '3D') {
            console.log('[Sidebar] Setting up 3D mode with LONG PULSE (10ms)...');
            
            // Send setup sequence with delays
            await onCommand(CMD.pulse3D_10ms);       // 1. Set pulse to 10ms (maximum) for stronger signal
            await new Promise(r => setTimeout(r, 150));
            
            await onCommand(CMD.frequencyCh0);       // 2. Set frequency channel 0
            await new Promise(r => setTimeout(r, 150));
            
            await onCommand(CMD.sensitivity);        // 3. Set sensitivity to 20
            await new Promise(r => setTimeout(r, 150));
            
            console.log('[Sidebar] 3D setup complete (10ms pulse), starting scan...');
            await onCommand(CMD.scan3D);             // 4. Start 3D scan
        }
        else if (scanMode === '2D') {
            onCommand(CMD.scan2D);
        }
        else {
            onCommand(CMD.scanDual);
        }
    };

    return (
        <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col h-screen text-gray-300">
            <div className="p-4 border-b border-gray-800">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
                    <Activity className="w-6 h-6 text-blue-400" />
                    CygLiDAR Direct
                </h1>
            </div>

            <div className="p-4 space-y-6 flex-1 overflow-y-auto">
                {/* Connection */}
                <section className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Connection</h2>
                    <div className="space-y-2">
                        <select 
                            value={baudRate} 
                            onChange={(e) => setBaudRate(Number(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={isConnected}
                        >
                            <option value={3000000}>3,000,000 bps</option>
                            <option value={250000}>250,000 bps</option>
                            <option value={115200}>115,200 bps</option>
                            <option value={57600}>57,600 bps</option>
                        </select>
                        <button
                            onClick={handleConnect}
                            className={`w-full py-2 rounded font-medium transition-colors ${
                                isConnected 
                                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50' 
                                : 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/50'
                            }`}
                        >
                            {isConnected ? 'Disconnect' : 'Connect Serial'}
                        </button>
                        
                        {/* Baud Rate Selector */}
                        {isConnected && (
                            <button
                                className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded font-medium"
                                onClick={() => setShowBaudModal(true)}
                            >
                                ⚡ Change Baud Rate
                            </button>
                        )}
                    </div>
                </section>

                {/* Device Info */}
                <section className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Device Info</h2>
                    <div className="bg-gray-800/50 rounded-lg p-3 text-sm space-y-2 font-mono border border-gray-700/50">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Model</span>
                            <span className="text-gray-300">CygLiDAR D1</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Version</span>
                            <span className="text-gray-300">{deviceInfo?.ver || '--.--.--'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Hardware</span>
                            <span className="text-gray-300">{deviceInfo?.hw || '--.--.--'}</span>
                        </div>
                    </div>
                    <button
                        onClick={() => onCommand(CMD.info)}
                        className="w-full py-2 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition-colors border border-blue-500/50 text-sm"
                    >
                        Query Info
                    </button>
                </section>

                {/* Parser Mode */}
                <section className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Parser Mode</h2>
                    <div className="space-y-2">
                        <select
                            value={parserMode}
                            onChange={(e) => setParserMode(e.target.value as ParserMode)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        >
                            <option value="bitshift">Bit Shifting (Default)</option>
                            <option value="hexstring">Hex String</option>
                        </select>
                        <p className="text-xs text-gray-500">
                            {parserMode === 'bitshift' ? 'Uses bit operations for parsing' : 'Uses hex string conversion'}
                        </p>
                    </div>
                </section>

                {/* Scan Control */}
                <section className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scan Control</h2>
                    <select 
                        value={scanMode} 
                        onChange={(e) => setScanMode(e.target.value as any)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="2D">2D Scan</option>
                        <option value="3D">3D Scan</option>
                        <option value="Dual">Dual Mode</option>
                    </select>
                    <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500">Noise Filter</label>
                            <select 
                                value={filterMode} 
                                onChange={(e) => setFilterMode(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {FILTERS.map(f => (
                                    <option key={f.id} value={f.id}>{f.label}</option>
                                ))}
                            </select>
                        </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={handleStart}
                            disabled={!isConnected}
                            className="flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Play size={16} fill="currentColor" /> Start
                        </button>
                        <button
                            onClick={() => onCommand(CMD.stop)}
                            disabled={!isConnected}
                            className="flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Square size={16} fill="currentColor" /> Stop
                        </button>
                    </div>
                    
                    {/* Sensitivity Control */}
                    <div className="space-y-2 pt-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-400 font-semibold">Sensitivity</label>
                            <span className="text-sm font-mono text-blue-400">{sensitivity}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={sensitivity}
                            onChange={(e) => {
                                const newSens = parseInt(e.target.value);
                                setSensitivity(newSens);
                                // Send SET_SENSITIVITY command (0x11) to sensor
                                const cmd = new Uint8Array([
                                    0x5A, 0x77, 0xFF,           // Header
                                    0x02, 0x00,                  // Length
                                    0x11, newSens,               // Command + Value
                                    (0x02 ^ 0x00 ^ 0x11 ^ newSens)  // Checksum
                                ]);
                                onCommand(cmd);
                            }}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Low</span>
                            <span>High</span>
                        </div>
                    </div>
                    
                    {/* Frequency Channel Control */}
                    <div className="space-y-2 pt-2">
                        <label className="text-xs text-gray-400 font-semibold">Frequency Channel</label>
                        <select
                            value={frequencyChannel}
                            onChange={(e) => {
                                const channel = parseInt(e.target.value);
                                setFrequencyChannel(channel);
                                // Send SET_FREQUENCY_CHANNEL command (0x0F)
                                const cmd = new Uint8Array([
                                    0x5A, 0x77, 0xFF,           // Header
                                    0x02, 0x00,                  // Length
                                    0x0F, channel,               // Command + Channel
                                    (0x02 ^ 0x00 ^ 0x0F ^ channel)  // Checksum
                                ]);
                                onCommand(cmd);
                            }}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                        >
                            {Array.from({length: 16}, (_, i) => (
                                <option key={i} value={i}>Channel {i}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500">Avoid interference with multiple devices</p>
                    </div>
                    
                    {/* Pulse Duration Control */}
                    <div className="space-y-2 pt-2">
                        <label className="text-xs text-gray-400 font-semibold">3D Pulse Duration</label>
                        <select
                            value={pulseMode}
                            onChange={(e) => {
                                const mode = e.target.value as 'auto' | 'fixed';
                                setPulseMode(mode);
                                if (mode === 'auto') {
                                    // Send AUTO mode (0x0C with [0x00, 0x00])
                                    const cmd = new Uint8Array([
                                        0x5A, 0x77, 0xFF,
                                        0x03, 0x00,
                                        0x0C, 0x00, 0x00,
                                        (0x03 ^ 0x00 ^ 0x0C ^ 0x00 ^ 0x00)
                                    ]);
                                    onCommand(cmd);
                                }
                            }}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                        >
                            <option value="auto">Auto</option>
                            <option value="fixed">Fixed</option>
                        </select>
                        
                        {pulseMode === 'fixed' && (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-500">Duration (μs)</span>
                                    <span className="text-sm font-mono text-blue-400">{pulseDuration}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="10000"
                                    step="100"
                                    value={pulseDuration}
                                    onChange={(e) => {
                                        const duration = parseInt(e.target.value);
                                        setPulseDuration(duration);
                                        // Send FIXED mode with duration value
                                        const LSB = duration & 0xFF;
                                        const MSB = ((duration >> 8) & 0xFF) | 0x40; // Set bit 6 for Fixed mode
                                        const cmd = new Uint8Array([
                                            0x5A, 0x77, 0xFF,
                                            0x03, 0x00,
                                            0x0C, LSB, MSB,
                                            (0x03 ^ 0x00 ^ 0x0C ^ LSB ^ MSB)
                                        ]);
                                        onCommand(cmd);
                                    }}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>0 μs</span>
                                    <span>10,000 μs</span>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* SLAM Mapping */}
                <section className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">SLAM Mapping</h2>
                    {/* SLAM Postprocessing */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Postprocessing</label>
                        <select 
                            value={slamPostprocessing}
                            onChange={(e) => onSlamPostprocessingChange(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white hover:border-blue-500 transition"
                        >
                            <option value="None">None (Raw)</option>
                            <option value="VoxelGrid">Voxel Grid</option>
                            <option value="SOR">Statistical Outlier Removal</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {!slamActive ? (
                            <button 
                                onClick={onStartMapping}
                                disabled={!isConnected}
                                className="col-span-2 py-2 bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
                            >
                                ▶ Start Mapping
                            </button>
                        ) : (
                            <button 
                                onClick={onStopMapping}
                                className="col-span-2 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm font-semibold"
                            >
                                ⏸ Stop Mapping
                            </button>
                        )}
                        <button 
                            onClick={onResetMap}
                            className="col-span-2 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
                        >
                            🗑 Reset Map
                        </button>
                    </div>
                    <div className="text-xs text-gray-500">
                        {slamActive ? (
                            <span className="text-green-400 font-semibold">● Mapping Active</span>
                        ) : (
                            <span>Build occupancy grid from 2D scans</span>
                        )}
                    </div>
                    
                    
                </section>

                {/* Tools */}
                <section className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tools</h2>
                    <div className="space-y-2">
                    {/* Test Flat Grid Button */}
                    <button 
                        className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-sm font-medium transition"
                        onClick={onTestFlatGrid}
                        disabled={!isConnected}
                        title="Generate test flat depth grid at 1500mm"
                    >
                            🧪 Test Flat Grid (1500mm)
                    </button>
                    
                    {/* View Depth Matrix Button */}
                    <button 
                        className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-sm font-medium transition"
                        onClick={onShowMatrix}
                        disabled={!isConnected}
                        title="View full 160×60 depth matrix"
                    >
                        📊 View Depth Matrix
                    </button>
                        <button 
                            onClick={onExportCSV}
                            disabled={!points}
                            className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300 disabled:opacity-50"
                        >
                            Export CSV
                        </button>
                        <button 
                            onClick={onToggleMesh}
                            className={`w-full py-2 rounded text-sm ${meshMode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-gray-800 text-gray-400'}`}
                        >
                            {meshMode ? 'Mesh Mode: ON' : 'Mesh Mode: OFF'}
                        </button>
                        
                    </div>
                </section>
            </div>

            {/* Stats Footer */}
            <div className="p-4 bg-gray-950 border-t border-gray-800 font-mono text-xs space-y-1">
                <div className="flex justify-between text-gray-500">
                    <span className="flex items-center gap-1"><Cpu size={12}/> FPS</span>
                    <span className={frames > 0 ? "text-green-400" : "text-gray-600"}>{frames}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                    <span>Points</span>
                    <span>{points}</span>
                </div>
            </div>
            
            {/* Baud Rate Change Modal */}
            {showBaudModal && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 w-80">
                        <h3 className="text-white font-bold mb-4">⚡ Change Baud Rate</h3>
                        <div className="space-y-2">
                            {[3000000, 250000, 115200, 57600].map(baud => (
                                <button
                                    key={baud}
                                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                                    onClick={() => {
                                        setShowBaudModal(false);
                                        onChangeBaudRate(baud);
                                    }}
                                >
                                    {baud.toLocaleString()} bps
                                </button>
                            ))}
                        </div>
                        <button
                            className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
                            onClick={() => setShowBaudModal(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
