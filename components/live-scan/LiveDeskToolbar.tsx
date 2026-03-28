"use client";

import { DeskStatusChip } from "./DeskStatusChip";
import { LiveScanControls } from "./LiveScanControls";
import type { LiveDeskState } from "./useLiveDesk";

export function LiveDeskToolbar({
  desk,
  scanLabel,
  onRunScan,
}: {
  desk: LiveDeskState;
  scanLabel: string | null;
  onRunScan: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <LiveScanControls
        scanning={desk.scanning}
        onRunScan={onRunScan}
        scanLabel={scanLabel}
        mode={desk.watchMode}
        onModeChange={desk.setWatchMode}
        intervalMin={desk.intervalMin}
        onIntervalMinChange={desk.setIntervalMin}
        countdown={desk.countdown}
        onReplay={desk.replayLastStream}
        soundsOn={desk.soundsOn}
        onSoundsToggle={desk.toggleSounds}
      />
      <DeskStatusChip status={desk.deskStatus} openAiSymbol={desk.openAiSymbol} />
    </div>
  );
}
