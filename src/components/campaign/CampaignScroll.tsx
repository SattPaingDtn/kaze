"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { scrollState } from "@/lib/store";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Maps page scroll → a float chapter index for the 3D camera, and runs the
 * DOM reveal animations. useGSAP() scopes and reverts everything on unmount
 * (no leaked ScrollTriggers when navigating to /configurator and back).
 */
export function CampaignScroll({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const sections = gsap.utils.toArray<HTMLElement>("[data-chapter]");
      let tops: number[] = [];

      const measure = () => {
        tops = sections.map((s) => s.getBoundingClientRect().top + window.scrollY);
      };
      const update = () => {
        const y = window.scrollY;
        let i = 0;
        while (i < tops.length - 1 && y >= tops[i + 1]) i++;
        const next = tops[i + 1] ?? tops[i] + 1;
        scrollState.chapter = i + Math.min(1, Math.max(0, (y - tops[i]) / (next - tops[i])));
        root.current?.style.setProperty("--chapter", scrollState.chapter.toFixed(3));
      };

      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: update,
        onRefresh: () => {
          measure();
          update();
        },
      });

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el, i) => {
          if (i === 0) {
            // Hero: plays on load, not on scroll (it's already in view)
            gsap.from(el.children, { y: 40, autoAlpha: 0, duration: 1.2, ease: "power3.out", stagger: 0.12, delay: 0.2 });
            return;
          }
          gsap.from(el.children, {
            y: 48,
            autoAlpha: 0,
            duration: 1,
            ease: "power3.out",
            stagger: 0.08,
            scrollTrigger: { trigger: el, start: "top 80%", toggleActions: "play none none reverse" },
          });
        });

        // Count-up numbers in the performance chapter
        gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
          const to = parseFloat(el.dataset.count ?? "0");
          const decimals = (el.dataset.count ?? "").split(".")[1]?.length ?? 0;
          // Server-rendered final value stays visible until the count actually starts.
          ScrollTrigger.create({
            trigger: el,
            start: "top bottom",
            once: true,
            onEnter: () => {
              const obj = { v: 0 };
              gsap.to(obj, {
                v: to,
                duration: 1.6,
                ease: "power2.out",
                onUpdate: () => (el.textContent = obj.v.toFixed(decimals)),
              });
            },
          });
        });
      });
    },
    { scope: root },
  );

  return <div ref={root}>{children}</div>;
}
