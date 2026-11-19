"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { detectTier, useReducedMotion, type Tier } from "@/lib/device";
import { Loader } from "../ui/Loader";
import { PerfHud } from "../ui/PerfHud";

/**
 * next/dynamic + ssr:false → three.js / R3F (~250 KB gz) is a separate chunk
 * that is NOT part of the server HTML or the first JS needed to paint the copy.
 * Good LCP/FCP even on slow mobile networks.
 */
const CampaignScene = dynamic(() => import("./CampaignScene"), { ssr: false });

export function CampaignStage({ label, loader }: { label: string; loader: { loading: string; ready: string } }) {
  const [tier, setTier] = useState<Tier | null>(null);
  const [hud, setHud] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    setTier(detectTier());
    setHud(new URLSearchParams(window.location.search).has("perf"));
  }, []);

  return (
    <>
      <div className="stage" aria-hidden="false">
        {tier && <CampaignScene tier={tier} reducedMotion={reduced} label={label} />}
      </div>
      {tier && <Loader text={loader} />}
      {hud && tier && <PerfHud tier={tier} />}
    </>
  );
}
