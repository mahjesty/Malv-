import { ArrowLeft } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

function exploreHubPath(pathname: string) {
  return pathname === "/app/explore" || pathname === "/app/explore/";
}

export function ExploreLayout() {
  const { pathname } = useLocation();
  const hub = exploreHubPath(pathname);

  return (
    <div
      className={[
        "relative min-h-full w-full",
        hub ? "" : "pb-10 pt-0 sm:pt-1"
      ].join(" ")}
    >
      {!hub ? (
        <div className="sticky top-0 z-30 mx-auto flex w-full max-w-7xl items-center px-4 pb-1.5 pt-0.5 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
            <Link
              to="/app/explore"
              className="group inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-malv-text/75 backdrop-blur-sm transition hover:bg-white/[0.07] hover:text-malv-text"
            >
              <ArrowLeft className="h-3 w-3 opacity-65 transition group-hover:-translate-x-0.5" aria-hidden />
              Hub
            </Link>
          </motion.div>
        </div>
      ) : null}

      <Outlet />
    </div>
  );
}
