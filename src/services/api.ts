// src/services/api.ts
import axios from "axios";

const API_BASE = "https://api.bisdig.my.id/api";

// Interface untuk item data dari API
export interface DataItem {
    id: string;
    tahun: number;
    nilai: string;
    [key: string]: any; // optional field untuk kolom tambahan
}

// Interface untuk item data custom kita (angka)
export interface ParsedDataItem {
    id: string;
    tahun: number;
    value: number;
    [key: string]: any;
}

// Fetch semua data utama
export const fetchData = async (): Promise<ParsedDataItem[]> => {
    try {
        const res = await axios.get(`${API_BASE}/data/`);
        // API menggunakan pagination DRF, data ada di res.data.results
        const results = (res.data as any).results || [];
        return results.map((item: DataItem) => ({
            ...item,
            value: parseFloat(item.nilai || "0")
        }));
    } catch (err) {
        console.error("Error fetching data:", err);
        return [];
    }
};

// Fetch data per ID
export const fetchDataById = async (id: string): Promise<ParsedDataItem | null> => {
    try {
        const res = await axios.get(`${API_BASE}/data/${id}/`);
        const item = res.data as DataItem;
        return {
            ...item,
            value: parseFloat(item.nilai || "0")
        };
    } catch (err) {
        console.error(`Error fetching data by ID ${id}:`, err);
        return null;
    }
};

// Fetch data pivot / summary (opsional)
export const fetchPivot = async (): Promise<any[]> => {
    try {
        const res = await axios.get(`${API_BASE}/data/pivot/`);
        return res.data as any[]; // data pivot merupakan array langsung
    } catch (err) {
        console.error("Error fetching pivot data:", err);
        return [];
    }
};

// Fetch list wilayah / regional mapping
export interface WilayahItem {
    id: string;
    nama_wilayah: string;
    kode_wilayah: string;
    tipe_wilayah: string;
    [key: string]: any;
}

export const fetchWilayah = async (): Promise<WilayahItem[]> => {
    try {
        const res = await axios.get(`${API_BASE}/wilayah/`);
        return ((res.data as any).results || []) as WilayahItem[];
    } catch (err) {
        console.error("Error fetching wilayah:", err);
        return [];
    }
};