"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MingxiDataSource } from "./port";

const DataSourceContext = createContext<MingxiDataSource | null>(null);

/** 由应用壳（演示站 / 正式站）在最外层注入具体的数据源实现。 */
export function MingxiDataSourceProvider({
  dataSource,
  children,
}: {
  dataSource: MingxiDataSource;
  children: ReactNode;
}) {
  return <DataSourceContext.Provider value={dataSource}>{children}</DataSourceContext.Provider>;
}

/** 组件取数据源。没有注入时直接报错，而不是悄悄退回某个默认实现。 */
export function useMingxiDataSource(): MingxiDataSource {
  const dataSource = useContext(DataSourceContext);
  if (!dataSource) {
    throw new Error("缺少 MingxiDataSourceProvider：界面组件必须在数据源提供者内渲染");
  }
  return dataSource;
}
