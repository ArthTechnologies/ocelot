<script>

  import Sidebar from "$lib/components/layout/Nav.svelte";
</script>

<div class="flex max-md:flex-col max-md:items-start bg-base-200 min-h-screen">
  <div class="w-full md:w-[22%] md:min-h-screen md:sticky md:top-0 flex-shrink-0">
    <Sidebar />
  </div>
  <div class="w-full md:w-[78%] flex-1 overflow-y-auto">
    <div class="p-4 sm:p-6 md:p-8 pb-12 lg:pt-16">
      <slot />
    </div>
  </div>
</div>
