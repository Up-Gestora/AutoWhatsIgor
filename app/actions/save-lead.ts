'use server'

import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function saveLead(formData: { name: string; email: string; whatsapp?: string }) {
  if (!db) {
    console.error("Firebase db is not initialized. Check your environment variables.");
    return { success: false, error: "Erro de configuração no servidor." };
  }

  try {
    // Referência para a coleção "leads"
    const leadsRef = collection(db, "leads");
    
    // Adiciona o documento
    const docRef = await addDoc(leadsRef, {
      ...formData,
      createdAt: serverTimestamp(),
      source: 'landing_page'
    });

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Erro ao salvar lead no Firebase:", error);
    return { success: false, error: "Falha ao salvar os dados. Tente novamente." };
  }
}

