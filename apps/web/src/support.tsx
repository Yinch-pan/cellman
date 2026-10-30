import { t as translate } from "./i18n";
import React from "react";

export function SupportPage() {
  return (
    <main className="support-page">
      <h1>{translate("ui.support.cc980edb2c")}</h1>
      <section className="panel">
        <h2>{translate("ui.support.55a2ce1324")}</h2>
        <p>{translate("ui.support.cacd9a7690")}</p>
        <p>
          <a href="mailto:yinchpan@gmail.com?subject=cellman%20feedback">
            yinchpan@gmail.com
          </a>
        </p>
        <p>{translate("ui.support.5d5059773c")}</p>
        <p>{translate("ui.support.39892bef34")}</p>
        <p>
          {translate("ui.support.dc49efcce8")}
          <a
            href="https://github.com/Yinch-pan/cellman/issues/new"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Issue
          </a>
          {translate("ui.support.1816a8f6fe")}
        </p>
      </section>
      <section className="panel">
        <h2>{translate("ui.support.3a67c41c60")}</h2>
        <p>{translate("ui.support.8a9811aa33")}</p>
        <p>{translate("ui.support.95ec2aed4c")}</p>
        <p>{translate("ui.support.a6abd3d80e")}</p>
        <p>{translate("ui.support.289da807cd")}</p>
      </section>
      <section className="panel">
        <h2>{translate("ui.support.712d191ae5")}</h2>
        <p>{translate("ui.support.2c531dd472")}</p>
      </section>
    </main>
  );
}
