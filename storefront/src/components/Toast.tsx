"use client";

import { useCallback, useEffect, useState } from "react";
import "./Toast.css";

type ToastMessage = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
};

// Global toast queue
const toastQueue: ToastMessage[] = [];
const listeners: Array<(toasts: ToastMessage[]) => void> = [];

export function showToast(message: string, type: "success" | "error" | "info" = "success") {
  const id = Date.now().toString() + Math.random();
  const toast: ToastMessage = { id, message, type };
  toastQueue.push(toast);
  notifyListeners();

  setTimeout(() => {
    const index = toastQueue.findIndex((t) => t.id === id);
    if (index !== -1) {
      toastQueue.splice(index, 1);
      notifyListeners();
    }
  }, 2500);
}

function notifyListeners() {
  listeners.forEach((listener) => listener([...toastQueue]));
}

function subscribe(listener: (toasts: ToastMessage[]) => void) {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return subscribe((newToasts) => setToasts(newToasts));
  }, []);

  return (
    <div className="toastContainer">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <div className="toastContent">
            {toast.type === "success" && <span className="toastIcon">✓</span>}
            {toast.type === "error" && <span className="toastIcon">✕</span>}
            {toast.type === "info" && <span className="toastIcon">ℹ</span>}
            <span className="toastMessage">{toast.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
