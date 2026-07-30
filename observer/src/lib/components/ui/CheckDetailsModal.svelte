<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { ShieldCheck, ShieldClose, Calendar, X } from "lucide-svelte";

  export let name: string;
  export let check: { status: string; reason?: string; checkedAt?: number };

  const dispatch = createEventDispatcher();

  onMount(() => {
    document.body.style.overflow = "hidden";
  });

  onDestroy(() => {
    document.body.style.overflow = "";
  });

  const checkedWhen = (ts: number | undefined) =>
    ts ? new Date(ts).toLocaleString() : "unknown time";

  const statusColor = check.status === "passed" ? "#10b981" : "#ef4444";
  const statusBg = check.status === "passed"
    ? "rgba(16, 185, 129, 0.15)"
    : "rgba(239, 68, 68, 0.15)";
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center p-4"
  style="background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);"
  on:click|self={() => dispatch("close")}
>
  <div class="check-modal relative flex flex-col w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl">

    <!-- Header -->
    <div class="check-modal-header flex items-center justify-between px-6 py-4">
      <div class="flex items-center gap-3">
        <div
          class="check-modal-icon-wrap flex items-center justify-center rounded-lg"
          style="background-color: {statusBg}; color: {statusColor};"
        >
          {#if check.status === "passed"}
            <ShieldCheck size={18} />
          {:else}
            <ShieldClose size={18} />
          {/if}
        </div>
        <div>
          <p class="font-poppins-bold text-base">Automated Check Result</p>
          <p class="check-modal-sub text-xs">{name}</p>
        </div>
      </div>
      <button class="check-modal-close rounded-lg p-1.5" on:click={() => dispatch("close")}>
        <X size={18} />
      </button>
    </div>

    <!-- Body -->
    <div class="check-modal-body px-6 pb-6 flex flex-col gap-4">

      <!-- Status Badge -->
      <div
        class="check-modal-status rounded-xl p-4 flex items-center gap-3"
        style="background-color: {statusBg}; border: 1px solid {statusColor}33;"
      >
        {#if check.status === "passed"}
          <ShieldCheck size={20} style="color: {statusColor};" />
        {:else}
          <ShieldClose size={20} style="color: {statusColor};" />
        {/if}
        <span class="font-semibold capitalize text-sm" style="color: {statusColor};">
          Check {check.status}
        </span>
      </div>

      <!-- Details -->
      <div class="check-modal-details space-y-3">
        {#if check.reason}
          <div>
            <p class="check-modal-label text-xs font-semibold uppercase tracking-wider mb-2">Reason</p>
            <p class="check-modal-text text-sm leading-relaxed">{check.reason}</p>
          </div>
        {/if}

        <div>
          <p class="check-modal-label text-xs font-semibold uppercase tracking-wider mb-2">Checked At</p>
          <div class="flex items-center gap-2 text-sm">
            <Calendar size={14} />
            <span class="check-modal-text">{checkedWhen(check.checkedAt)}</span>
          </div>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="check-modal-footer rounded-lg p-3 text-xs">
        {#if check.status === "passed"}
          <p>This modpack successfully boots to an online state. It's ready to use on your server.</p>
        {:else}
          <p>This modpack failed to boot. Check the reason above for details. It may need configuration adjustments before use.</p>
        {/if}
      </div>

    </div>
  </div>
</div>

<style lang="scss">
  .check-modal {
    background: var(--check-bg, #1a1a24);
    border: 1px solid rgba(255,255,255,0.07);
  }

  .check-modal-header {
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.025);
  }

  .check-modal-icon-wrap {
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
  }

  .check-modal-sub {
    color: rgba(255,255,255,0.4);
  }

  .check-modal-close {
    background: transparent;
    color: rgba(255,255,255,0.4);
    border: none;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    &:hover {
      background: rgba(255,255,255,0.07);
      color: rgba(255,255,255,0.8);
    }
  }

  .check-modal-body {
    background: transparent;
  }

  .check-modal-status {
    transition: all 0.2s ease;
  }

  .check-modal-details {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 0.75rem;
    padding: 1rem;
  }

  .check-modal-label {
    color: rgba(255,255,255,0.5);
    letter-spacing: 0.05em;
  }

  .check-modal-text {
    color: rgba(255,255,255,0.8);
  }

  .check-modal-footer {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.65);
    line-height: 1.5;
  }

  @media (prefers-color-scheme: light) {
    .check-modal {
      background: #fff;
      border-color: rgba(0,0,0,0.08);
    }
    .check-modal-header {
      border-color: rgba(0,0,0,0.07);
      background: rgba(0,0,0,0.02);
    }
    .check-modal-sub {
      color: rgba(0,0,0,0.45);
    }
    .check-modal-close {
      color: rgba(0,0,0,0.4);
      &:hover {
        background: rgba(0,0,0,0.06);
        color: rgba(0,0,0,0.8);
      }
    }
    .check-modal-details {
      background: rgba(0,0,0,0.03);
      border-color: rgba(0,0,0,0.08);
    }
    .check-modal-label {
      color: rgba(0,0,0,0.5);
    }
    .check-modal-text {
      color: rgba(0,0,0,0.85);
    }
    .check-modal-footer {
      background: rgba(0,0,0,0.03);
      border-color: rgba(0,0,0,0.08);
      color: rgba(0,0,0,0.65);
    }
  }

  :root[data-theme="light"] {
    .check-modal {
      background: #fff;
      border-color: rgba(0,0,0,0.08);
    }
    .check-modal-header {
      border-color: rgba(0,0,0,0.07);
      background: rgba(0,0,0,0.02);
    }
    .check-modal-sub {
      color: rgba(0,0,0,0.45);
    }
    .check-modal-close {
      color: rgba(0,0,0,0.4);
    }
    .check-modal-details {
      background: rgba(0,0,0,0.03);
      border-color: rgba(0,0,0,0.08);
    }
    .check-modal-label {
      color: rgba(0,0,0,0.5);
    }
    .check-modal-text {
      color: rgba(0,0,0,0.85);
    }
    .check-modal-footer {
      background: rgba(0,0,0,0.03);
      border-color: rgba(0,0,0,0.08);
      color: rgba(0,0,0,0.65);
    }
  }
</style>
