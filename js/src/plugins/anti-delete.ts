// Anti-Delete + Edit History
// Instead of letting Discord drop a deleted message, we flag it as deleted so it
// stays visible (dimmed), and we keep every edited version in an editHistory[].
import { before } from "../core/patcher";
import { FluxDispatcher, MessageStore } from "../core/api";
import type { Plugin } from "../index";

const plugin: Plugin = {
  id: "anti-delete",
  name: "الرسائل المحذوفة تبقى",
  unpatches: [],

  start() {
    const Dispatcher: any = FluxDispatcher();
    if (!Dispatcher) return console.log("[ayCORD] anti-delete: no dispatcher");

    // 1) Turn a delete into a "mark as deleted" flag.
    this.unpatches.push(
      before(Dispatcher, "dispatch", (args: any[]) => {
        const action = args[0];
        if (!action) return;

        if (action.type === "MESSAGE_DELETE") {
          const msg = MessageStore()?.getMessage?.(action.channelId, action.id);
          if (msg && !msg.__aycordDeleted) {
            // Rewrite the action to an update that keeps the row.
            args[0] = {
              type: "MESSAGE_UPDATE",
              message: {
                ...msg,
                __aycordDeleted: true,
                content: msg.content,
              },
              log_edit: false,
            };
          }
        }

        if (action.type === "MESSAGE_DELETE_BULK" && Array.isArray(action.ids)) {
          // Keep bulk-deleted rows too.
          action.__aycordSkip = true;
          for (const id of action.ids) {
            const msg = MessageStore()?.getMessage?.(action.channelId, id);
            if (msg) {
              Dispatcher.dispatch({
                type: "MESSAGE_UPDATE",
                message: { ...msg, __aycordDeleted: true },
                log_edit: false,
              });
            }
          }
          args[0] = { type: "MESSAGE_DELETE_BULK", ids: [], channelId: action.channelId };
        }

        // 2) Record edit history.
        if (action.type === "MESSAGE_UPDATE" && action.message && !action.__aycordDeleted) {
          const prev = MessageStore()?.getMessage?.(action.message.channel_id, action.message.id);
          if (prev && prev.content && action.message.content && prev.content !== action.message.content) {
            const hist = prev.__aycordEdits || [];
            action.message.__aycordEdits = [...hist, { content: prev.content, ts: Date.now() }];
          }
        }
      })
    );

    console.log("[ayCORD] anti-delete active");
  },

  stop() { this.unpatches.forEach((u) => u()); this.unpatches = []; },
};

export default plugin;
