import { create } from 'zustand';
import axios from 'axios';
import { API_URL } from '../config';
import { invalidateCache } from '../apiCache';

/* ═══════════════════════════════════════════════════════
   PENDING OPERATION TYPES
   ═══════════════════════════════════════════════════════ */
export type EntityType = 'branches' | 'semesters' | 'subjects' | 'faculties' | 'rooms' | 'allocations' | 'mappings/faculty';
export type OpType = 'create' | 'update' | 'delete';

export interface PendingOp {
  id: string;           // unique op id (uuid-like)
  type: OpType;
  entity: EntityType;
  tempId?: number;      // for creates — the local temp ID
  entityId?: number;    // for updates/deletes — the real DB ID
  data?: any;           // payload for create/update
}

let _opCounter = 0;
const nextOpId = () => `op_${Date.now()}_${++_opCounter}`;

/* ═══════════════════════════════════════════════════════
   STORE
   ═══════════════════════════════════════════════════════ */
interface PendingChangesState {
  ops: PendingOp[];
  isFlushing: boolean;
  flushError: string | null;

  addOp: (op: Omit<PendingOp, 'id'>) => void;
  removeOp: (opId: string) => void;
  clearOps: () => void;
  hasPendingChanges: () => boolean;
  pendingCount: () => number;
  flushToApi: (configId: number) => Promise<{ success: boolean; error?: string }>;
}

export const usePendingChanges = create<PendingChangesState>((set, get) => ({
  ops: [],
  isFlushing: false,
  flushError: null,

  addOp: (op) => set((state) => {
    if (op.type === 'delete') {
      // Clean up related operations when a faculty is deleted
      if (op.entity === 'faculties' && op.entityId !== undefined) {
        const filteredOps = state.ops.filter(o => {
          if (op.entityId < 0 && o.entity === 'faculties' && o.tempId === op.entityId) {
            return false;
          }
          if (o.entity === 'mappings/faculty' && o.data?.faculty_id === op.entityId) {
            return false;
          }
          if (o.entity === 'allocations' && o.data?.faculty_id === op.entityId) {
            return false;
          }
          return true;
        });
        if (op.entityId < 0) {
          return { ops: filteredOps };
        } else {
          return { ops: [...filteredOps, { ...op, id: nextOpId() }] };
        }
      }

      if (op.entityId !== undefined && op.entityId < 0) {
        return {
          ops: state.ops.filter(o => 
            !(o.type === 'create' && o.entity === op.entity && o.tempId === op.entityId) &&
            !(o.type === 'update' && o.entity === op.entity && o.entityId === op.entityId)
          )
        };
      }
      if (op.entity === 'mappings/faculty' && op.data?.faculty_id !== undefined) {
        const semesterId = op.entityId;
        const facultyId = op.data.faculty_id;
        const hasCreate = state.ops.some(o => 
          o.type === 'create' && 
          o.entity === 'mappings/faculty' && 
          o.data?.semester_id === semesterId && 
          o.data?.faculty_id === facultyId
        );
        if (hasCreate) {
          return {
            ops: state.ops.filter(o => 
              !(o.type === 'create' && o.entity === 'mappings/faculty' && o.data?.semester_id === semesterId && o.data?.faculty_id === facultyId)
            )
          };
        }
      }
    }
    return { ops: [...state.ops, { ...op, id: nextOpId() }] };
  }),

  removeOp: (opId) => set((state) => ({ ops: state.ops.filter(o => o.id !== opId) })),

  clearOps: () => set({ ops: [], flushError: null }),

  hasPendingChanges: () => get().ops.length > 0,

  pendingCount: () => get().ops.length,

  flushToApi: async (configId: number) => {
    const { ops } = get();
    if (ops.length === 0) return { success: true };

    set({ isFlushing: true, flushError: null });

    // Temp ID → Real ID mapping (filled as creates succeed)
    const idMap: Record<number, number> = {};
    const resolveId = (id: number | undefined): number | undefined => {
      if (id === undefined) return undefined;
      return id < 0 ? (idMap[id] ?? id) : id;
    };

    // Sort ops by dependency:
    // Creates first (branches → semesters → subjects, faculties/rooms, mappings, allocations)
    // Then updates, then deletes (reverse order)
    const entityCreateOrder: EntityType[] = ['branches', 'semesters', 'subjects', 'faculties', 'rooms', 'mappings/faculty', 'allocations'];
    const entityDeleteOrder: EntityType[] = ['allocations', 'mappings/faculty', 'subjects', 'semesters', 'branches', 'faculties', 'rooms'];

    const creates = ops.filter(o => o.type === 'create');
    const updates = ops.filter(o => o.type === 'update');
    const deletes = ops.filter(o => o.type === 'delete');

    // Sort creates by entity dependency order
    creates.sort((a, b) => entityCreateOrder.indexOf(a.entity) - entityCreateOrder.indexOf(b.entity));
    // Sort deletes by reverse dependency order
    deletes.sort((a, b) => entityDeleteOrder.indexOf(a.entity) - entityDeleteOrder.indexOf(b.entity));

    const ordered = [...deletes, ...updates, ...creates];
    const errors: string[] = [];

    for (const op of ordered) {
      try {
        if (op.type === 'create') {
          const payload = { ...op.data };

          // Resolve any temp IDs in the payload
          if (payload.branch_id && payload.branch_id < 0) {
            payload.branch_id = resolveId(payload.branch_id);
          }
          if (payload.semester_id && payload.semester_id < 0) {
            payload.semester_id = resolveId(payload.semester_id);
          }
          if (payload.faculty_id && payload.faculty_id < 0) {
            payload.faculty_id = resolveId(payload.faculty_id);
          }
          if (payload.subject_id && payload.subject_id < 0) {
            payload.subject_id = resolveId(payload.subject_id);
          }
          if (payload.room_id && payload.room_id < 0) {
            payload.room_id = resolveId(payload.room_id);
          }

          // Ensure config_id is set
          if (!payload.config_id && op.entity !== 'mappings/faculty' && op.entity !== 'allocations') {
            payload.config_id = configId;
          }
          if (op.entity === 'allocations' && !payload.config_id) {
            payload.config_id = configId;
          }

          const res = await axios.post(`${API_URL}/${op.entity}`, payload);
          
          // Map temp ID to real ID
          if (op.tempId !== undefined && res.data?.id) {
            idMap[op.tempId] = res.data.id;
          }
        } else if (op.type === 'update') {
          const entityId = resolveId(op.entityId);
          if (entityId === undefined) continue;
          await axios.put(`${API_URL}/${op.entity}/${entityId}`, op.data);
        } else if (op.type === 'delete') {
          const entityId = resolveId(op.entityId);
          if (entityId === undefined) continue;
          // Skip deleting temp items that were never saved
          if (entityId < 0) continue;
          
          // Special handling for faculty mapping deletes
          if (op.entity === 'mappings/faculty' && op.data?.faculty_id) {
            await axios.delete(`${API_URL}/mappings/faculty/${entityId}/${op.data.faculty_id}`);
          } else {
            await axios.delete(`${API_URL}/${op.entity}/${entityId}`);
          }
        }
      } catch (err: any) {
        const detail = err.response?.data?.detail || err.message || `Failed ${op.type} on ${op.entity}`;
        errors.push(detail);
        // Continue with remaining ops — don't stop on first error
      }
    }

    invalidateCache();

    if (errors.length > 0) {
      const errorMsg = `${errors.length} error(s):\n${errors.join('\n')}`;
      set({ isFlushing: false, flushError: errorMsg, ops: [] });
      return { success: false, error: errorMsg };
    }

    set({ isFlushing: false, flushError: null, ops: [] });
    return { success: true };
  },
}));
