import { getSettings } from '../Settings/state';
import { SUPPORT_EDIT_REPLACE } from '../history/actionTypes';
import { pushSupportHistory } from '../history/supportHistory';
import { beginSupportStateBatch, cloneSupportState, endSupportStateBatch, getSnapshot, setSnapshot } from '../state';
import { isAutoBraceableShaftType, type SupportTypeId } from '../supportTypeRegistry';
import { buildAutoBracedSnapshot } from './autoBrace';

/** Commit a manual placement and its local bracing as one existing edit action. */
export function commitManualSupportPlacement(
    typeId: SupportTypeId,
    changedSupportIds: ReadonlySet<string>,
    mutate: () => void,
    recordLegacyHistory: () => void,
): void {
    const settings = getSettings().autoBracing;
    if (!settings.autoBraceWhilePlacing || !isAutoBraceableShaftType(typeId)) {
        mutate();
        recordLegacyHistory();
        return;
    }

    const before = cloneSupportState(getSnapshot());
    beginSupportStateBatch();
    try {
        mutate();
        // Bracing is an optional addition to a valid model contact. If it
        // fails, keep the placement and still record its single undo action.
        try {
            const built = buildAutoBracedSnapshot(getSnapshot(), settings, { changedSupportIds });
            if (built.changed) setSnapshot(built.snapshot);
        } catch (error) {
            console.error('[LiveBracing] Placement kept after bracing failed', error);
        }
        pushSupportHistory({
            type: SUPPORT_EDIT_REPLACE,
            payload: { before, after: cloneSupportState(getSnapshot()) },
        });
    } finally {
        endSupportStateBatch();
    }
}
