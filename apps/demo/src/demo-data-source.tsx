"use client";

import { ScriptedDataSource } from "@mingxi/demo-data";
import { MingxiDataSourceProvider } from "@mingxi/ui/data-source/context";
import type { ReactNode } from "react";

// 整个演示站共用一个实例：录制数据只加载一次，组件拿到的数据源引用始终不变。
// 录制数据在构建时由 scripts/sync-fixtures.mjs 放到 public/demo-fixtures。
const dataSource = new ScriptedDataSource({ fixtureBaseUrl: "/demo-fixtures" });

export function DemoDataSourceProvider({ children }: { children: ReactNode }) {
  return <MingxiDataSourceProvider dataSource={dataSource}>{children}</MingxiDataSourceProvider>;
}
