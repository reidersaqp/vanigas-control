import { NextResponse } from "next/server";
import { tablesDB, DATABASE_ID } from "../../../lib/appwrite";

export async function GET() {
  try {
    // Consultamos la tabla de inventario para forzar la actividad en Appwrite
    await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "inventario",
    });
    
    return NextResponse.json({ 
      status: "ok", 
      message: "Appwrite despertado correctamente",
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      status: "warning", 
      message: "Appwrite respondio con error pero recibio la peticion", 
      error: error.message || String(error)
    });
  }
}
