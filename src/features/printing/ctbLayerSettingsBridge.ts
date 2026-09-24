import { invoke } from '@tauri-apps/api/core';
import type { CtbResolvedLayer } from '@/features/slicing/ctbLayerTiming';

export type CtbStoredLayerSettings = Omit<CtbResolvedLayer, 'isDummy' | 'modelLayerNumber'> & {
  layerNumber: number;
  layerCount: number;
  version: number;
  bottomLayerCount: number;
  perLayerSettings: boolean;
};

export function readCtbLayerSettings(sourcePath: string, layerNumber: number): Promise<CtbStoredLayerSettings> {
  return invoke('read_ctb_layer_settings', { sourcePath, layerNumber });
}
