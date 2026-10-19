"use client";

import { useEffect } from "react";

// 后台首页即用户列表。
export default function Home() {
  useEffect(() => {
    window.location.replace("/users");
  }, []);
  return null;
}
