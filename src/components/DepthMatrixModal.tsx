import React from 'react';

interface DepthMatrixModalProps {
    isOpen: boolean;
    onClose: () => void;
    depthData: Uint16Array | null;
}

export const DepthMatrixModal: React.FC<DepthMatrixModalProps> = ({ isOpen, onClose, depthData }) => {
    if (!isOpen || !depthData) return null;

    const GRID_WIDTH = 160;
    const GRID_HEIGHT = 60;

    // Format matrix as string
    const formatMatrix = () => {
        let matrixStr = '';
        for (let row = 0; row < GRID_HEIGHT; row++) {
            const rowValues = [];
            for (let col = 0; col < GRID_WIDTH; col++) {
                const idx = row * GRID_WIDTH + col;
                const value = depthData[idx];
                // Format: 4 digits with leading spaces
                rowValues.push(value.toString().padStart(4, ' '));
            }
            matrixStr += `R${row.toString().padStart(2, '0')}: ${rowValues.join(' ')}\n`;
        }
        return matrixStr;
    };

    const handleCopy = () => {
        const matrixText = formatMatrix();
        navigator.clipboard.writeText(matrixText);
        alert('Matrix copied to clipboard!');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-11/12 h-5/6 flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">
                        Depth Grid Matrix (160×60 = 9600 pixels)
                    </h2>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleCopy}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                        >
                            📋 Copy
                        </button>
                        <button 
                            onClick={onClose}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                            ✕ Close
                        </button>
                    </div>
                </div>

                {/* Content - scrollable */}
                <div className="flex-1 overflow-auto p-4">
                    <pre className="text-xs font-mono text-green-400 whitespace-pre">
                        {formatMatrix()}
                    </pre>
                </div>

                {/* Footer Info */}
                <div className="p-3 border-t border-gray-700 text-sm text-gray-400">
                    <div className="flex gap-6">
                        <span>💡 Tip: Scroll to view all rows</span>
                        <span>📊 Format: R00-R59 (rows) × C000-C159 (columns)</span>
                        <span>🎯 Values in mm</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
