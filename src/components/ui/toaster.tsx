"use client";

import { useState, useEffect, createContext, useContext } from "react";

interface Toast {
  id: string;
  message: string;
  type?: "success" | "error";
}

// Simple toast component without external dependencies
export function Toaster() {
  return null; // Placeholder – Toasts werden inline gezeigt
}
