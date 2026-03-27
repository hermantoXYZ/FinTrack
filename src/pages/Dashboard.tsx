import React, { useEffect, useState, useMemo } from "react";
import { fetchData, fetchPivot, fetchWilayah, ParsedDataItem, WilayahItem } from "../services/api";
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from "recharts";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { scaleQuantile } from "d3-scale";
import "./Dashboard.css";

const geoUrl = "/indonesia-kab.json";

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="custom-tooltip">
                <div className="tooltip-label">{`Periode: ${label}`}</div>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="tooltip-value" style={{ color: entry.color }}>
                        {entry.name}: {entry.value?.toLocaleString("id-ID") || 0}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const formatValue = (val: number) => {
    if (val == null) return "0";
    if (val >= 1_000_000_000_000) return `${(val / 1_000_000_000_000).toFixed(2)} T`;
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)} M`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)} Jt`;
    return val.toLocaleString("id-ID");
};

const Dashboard = () => {
    const [originalData, setOriginalData] = useState<ParsedDataItem[]>([]);
    const [originalPivotData, setOriginalPivotData] = useState<any[]>([]);
    const [wilayahData, setWilayahData] = useState<WilayahItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Map & Filter States
    const [selectedWilayahId, setSelectedWilayahId] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, title: "", content: "" });

    // Derive filtered data
    const data = useMemo(() => {
        if (!selectedWilayahId) return originalData;
        return originalData.filter(d => d.wilayah?.id === selectedWilayahId || d.wilayah_id === selectedWilayahId);
    }, [originalData, selectedWilayahId]);

    const pivotData = useMemo(() => {
        if (!selectedWilayahId) return originalPivotData;
        return originalPivotData.filter(d => d.wilayah_id === selectedWilayahId || d.id === selectedWilayahId);
    }, [originalPivotData, selectedWilayahId]);

    // KPI States
    const [totalValue, setTotalValue] = useState(0);
    const [avgValue, setAvgValue] = useState(0);
    const [yoyGrowth, setYoyGrowth] = useState({ value: 0, isPositive: true });

    useEffect(() => {
        const loadAllData = async () => {
            try {
                const [resData, resPivot, resWilayah] = await Promise.all([
                    fetchData(),
                    fetchPivot(),
                    fetchWilayah()
                ]);

                // Urutkan data berdasarkan tahun
                const sortedData = [...resData].sort((a, b) => a.tahun - b.tahun);
                setOriginalData(sortedData);
                setOriginalPivotData(resPivot);
                setWilayahData(resWilayah);
            } catch (error) {
                console.error("Gagal memuat data:", error);
            } finally {
                setLoading(false);
            }
        };

        loadAllData();
    }, []);

    // Recalculate KPI when data (filtered/unfiltered) changes
    useEffect(() => {
        if (data.length > 0) {
            const total = data.reduce((acc, curr) => acc + (curr.value || 0), 0);
            setTotalValue(total);
            setAvgValue(total / data.length);

            if (data.length >= 2) {
                const currentYearValue = data[data.length - 1].value || 0;
                const previousYearValue = data[data.length - 2].value || 0;
                if (previousYearValue > 0) {
                    const growth = ((currentYearValue - previousYearValue) / previousYearValue) * 100;
                    setYoyGrowth({
                        value: Math.abs(growth),
                        isPositive: growth >= 0
                    });
                } else {
                    setYoyGrowth({ value: 0, isPositive: true });
                }
            } else {
                setYoyGrowth({ value: 0, isPositive: true });
            }
        } else {
            setTotalValue(0);
            setAvgValue(0);
            setYoyGrowth({ value: 0, isPositive: true });
        }
    }, [data]);

    // Color Scale for the Map based on DAK Fisik
    const colorScale = useMemo(() => {
        const mapColors = ["#001B36", "#043B66", "#075C96", "#097CC5", "#0B9DF5", "#00f2fe"];
        if (originalPivotData.length === 0) return () => "#1e293b";

        // Buat aggregate dak_fisik per region
        const regionalSums = originalPivotData.reduce((acc: any, curr: any) => {
            const wId = curr.wilayah_id;
            if (!acc[wId]) acc[wId] = 0;
            acc[wId] += (curr.dak_fisik || 0);
            return acc;
        }, {});

        const values = Object.values(regionalSums) as number[];
        // Cek jika tidak ada data numeric
        if (values.length === 0 || Math.max(...values) === 0) return () => "#1e293b";

        return scaleQuantile<string>()
            .domain(values)
            .range(mapColors);
    }, [originalPivotData]);

    const findRegionDataMatch = (geo: any) => {
        const geoName = geo.properties.NAME_2 || "";
        // Pencocokan fuzzy sederhana (menghapus "Kab."/"Kota" dan mengabaikan huruf besar/kecil)
        const matched = wilayahData.find(w => {
            const wName = w.nama_wilayah.replace(/Kab\.\s|Kota\s/gi, "").trim().toLowerCase();
            return wName === geoName.toLowerCase() || geoName.toLowerCase().includes(wName);
        });

        // Sum DAK Fisik (Atau Value lainnya)
        let sumValue = 0;
        if (matched) {
            sumValue = originalPivotData
                .filter(p => p.wilayah_id === matched.id)
                .reduce((acc, curr) => acc + (curr.dak_fisik || 0), 0);
        }

        return { matched, sumValue };
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Memuat Data Fiskal & Geospasial...</p>
            </div>
        );
    }

    const activeWilayahName = selectedWilayahId
        ? wilayahData.find(w => w.id === selectedWilayahId)?.nama_wilayah
        : "Seluruh Wilayah";

    return (
        <div className="dashboard-container">
            <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="dashboard-title">Monitoring Fiskal</h1>
                    <p className="dashboard-subtitle">Ringkasan Kinerja & Indikator Fiskal Terkini</p>
                </div>
                {selectedWilayahId && (
                    <button
                        onClick={() => setSelectedWilayahId(null)}
                        style={{ padding: '8px 16px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                    >
                        Reset Filter: {activeWilayahName} ✕
                    </button>
                )}
            </header>

            {/* KPI Cards */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <h3 className="kpi-title">Total Nilai Akumulasi ({activeWilayahName})</h3>
                    <div className="kpi-value">{formatValue(totalValue)}</div>
                    <div className="kpi-trend neutral">Data dari {data.length} Tahun</div>
                </div>
                <div className="kpi-card">
                    <h3 className="kpi-title">Rata-rata Nilai per Tahun</h3>
                    <div className="kpi-value">{formatValue(avgValue)}</div>
                    <div className="kpi-trend neutral">Indikator Baseline</div>
                </div>
                <div className="kpi-card">
                    <h3 className="kpi-title">Pertumbuhan (YoY)</h3>
                    <div className="kpi-value">
                        {yoyGrowth.value.toFixed(2)}%
                    </div>
                    <div className={`kpi-trend ${yoyGrowth.isPositive ? 'positive' : 'negative'}`}>
                        {yoyGrowth.isPositive ? '↑ Meningkat' : '↓ Menurun'} vs Tahun Sblm.
                    </div>
                </div>
            </div>

            {/* Interaktive Geo Map */}
            <div className="charts-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="chart-card map-card">
                    <div className="chart-header" style={{ position: 'absolute', zIndex: 10, background: 'rgba(15, 23, 42, 0.8)', padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
                        <h2 className="chart-title">Pemetaan Persebaran DAK Fisik (Kabupaten)</h2>
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Klik pada area manapun untuk memfilter grafik di bawah</span>
                    </div>

                    <div className="map-container">
                        <ComposableMap
                            projection="geoMercator"
                            projectionConfig={{ scale: 2200, center: [118, -2] }}
                            width={1000}
                            height={600}
                        >
                            <ZoomableGroup>
                                <Geographies geography={geoUrl}>
                                    {({ geographies }) =>
                                        geographies.map((geo) => {
                                            const { matched, sumValue } = findRegionDataMatch(geo);
                                            const isSelected = selectedWilayahId === matched?.id;
                                            const fillColor = sumValue > 0 ? colorScale(sumValue) as string : "#1e293b";

                                            return (
                                                <Geography
                                                    key={geo.rsmKey}
                                                    geography={geo}
                                                    onClick={() => {
                                                        if (matched) {
                                                            setSelectedWilayahId(isSelected ? null : matched.id);
                                                        }
                                                    }}
                                                    onMouseEnter={(e: any) => {
                                                        setTooltip({
                                                            show: true,
                                                            x: e.clientX,
                                                            y: e.clientY,
                                                            title: matched ? matched.nama_wilayah : (geo.properties.NAME_2 || "Peta Area"),
                                                            content: matched ? `DAK Fisik Akumulasi: ${formatValue(sumValue)}` : "Belum terpetakan pada API"
                                                        });
                                                    }}
                                                    onMouseMove={(e: any) => {
                                                        setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
                                                    }}
                                                    onMouseLeave={() => {
                                                        setTooltip(prev => ({ ...prev, show: false }));
                                                    }}
                                                    style={{
                                                        default: {
                                                            fill: isSelected ? "#00f2fe" : fillColor,
                                                            stroke: "rgba(255,255,255,0.1)",
                                                            strokeWidth: 0.5,
                                                            outline: "none",
                                                            transition: "fill 0.3s ease"
                                                        },
                                                        hover: {
                                                            fill: "#e879f9",
                                                            stroke: "white",
                                                            strokeWidth: 1,
                                                            outline: "none",
                                                            cursor: matched ? "pointer" : "default",
                                                            transition: "fill 0.3s ease"
                                                        },
                                                        pressed: {
                                                            fill: "#4facfe",
                                                            outline: "none"
                                                        }
                                                    }}
                                                />
                                            );
                                        })
                                    }
                                </Geographies>
                            </ZoomableGroup>
                        </ComposableMap>
                    </div>

                    {/* Tooltip Overlay */}
                    {tooltip.show && (
                        <div className="map-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                            <div className="title">{tooltip.title}</div>
                            <div className="value">{tooltip.content}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Charts */}
            <div className="charts-grid">
                <div className="chart-card">
                    <div className="chart-header">
                        <h2 className="chart-title">Tren Kinerja Fiskal Tahunan ({activeWilayahName})</h2>
                    </div>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00f2fe" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#00f2fe" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="tahun" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" tickFormatter={(val) => formatValue(val)} />
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    name="Nilai"
                                    stroke="#00f2fe"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorValue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-card">
                    <div className="chart-header">
                        <h2 className="chart-title">Pivot Breakdowns ({activeWilayahName})</h2>
                    </div>
                    <div className="chart-container">
                        {pivotData && pivotData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pivotData}>
                                    <XAxis dataKey="tahun" stroke="#94a3b8" />
                                    <YAxis stroke="#94a3b8" tickFormatter={(val) => formatValue(val)} />
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Bar dataKey="dak_fisik" name="DAK Fisik" fill="#4facfe" stackId="a" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="dana_desa" name="Dana Desa" fill="#00f2fe" stackId="a" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="dau_block_grant" name="DAU Block Grant" fill="#8b5cf6" stackId="a" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                                Belum ada data pivot
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* List Wilayah */}
            {wilayahData && wilayahData.length > 0 && !selectedWilayahId && (
                <div className="chart-card">
                    <div className="chart-header">
                        <h2 className="chart-title">Directory Seluruh Wilayah</h2>
                    </div>
                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tipe</th>
                                    <th>Kode Wilayah</th>
                                    <th>Nama Wilayah</th>
                                </tr>
                            </thead>
                            <tbody>
                                {wilayahData.slice(0, 10).map((wilayah) => (
                                    <tr key={wilayah.id}>
                                        <td>{wilayah.tipe_wilayah || "ID"}</td>
                                        <td>{wilayah.kode_wilayah}</td>
                                        <td>{wilayah.nama_wilayah}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;