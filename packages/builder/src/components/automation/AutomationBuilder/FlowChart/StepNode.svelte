<script>
  import FlowItem from "./FlowItem.svelte"
  import BranchNode from "./BranchNode.svelte"
  import { ViewMode } from "@/types/automations"
  import { AutomationActionStepId } from "@budibase/types"
  import { ActionButton, notifications } from "@budibase/bbui"
  import { automationStore } from "@/stores/builder"
  import { environment } from "@/stores/portal"
  import { cloneDeep } from "lodash"
  import { memo } from "@budibase/frontend-core"
  import { getContext, onMount } from "svelte"

  export let step = {}
  export let stepIdx
  export let automation
  export let blocks
  export let isLast = false
  export let logData = null
  export let viewMode = ViewMode.EDITOR
  export let selectedLogStepId = null
  export let onStepSelect = () => {}

  const memoEnvVariables = memo($environment.variables)
  const view = getContext("draggableView")

  let stepEle

  $: memoEnvVariables.set($environment.variables)
  $: blockRef = blocks?.[step.id]
  $: pathToCurrentNode = blockRef?.pathTo
  $: isBranch = step.stepId === AutomationActionStepId.BRANCH
  $: branches = step.inputs?.branches

  // Log execution state
  $: logStepData = getLogStepData(logData, step)

  // For branch steps in logs mode, determine which branch was executed
  $: executedBranchId =
    isBranch && viewMode === ViewMode.LOGS && logStepData?.outputs?.branchId
      ? logStepData.outputs.branchId
      : null

  $: isBranchUnexecuted =
    isBranch && viewMode === ViewMode.LOGS && !logStepData?.outputs?.branchId

  function getLogStepData(logData, step) {
    if (!logData || viewMode !== ViewMode.LOGS) return null

    // For trigger step
    if (step.type === "TRIGGER") {
      return logData.trigger
    }

    // For action steps, find by unique id match
    const logSteps = logData.steps || []
    return logSteps.find(logStep => logStep.id === step.id)
  }

  // All bindings available to this point
  $: availableBindings = automationStore.actions.getPathBindings(
    step.id,
    automation
  )

  // Fetch the env bindings
  $: environmentBindings =
    automationStore.actions.buildEnvironmentBindings($memoEnvVariables)

  $: userBindings = automationStore.actions.buildUserBindings()
  $: settingBindings = automationStore.actions.buildSettingBindings()

  // Combine all bindings for the step
  $: bindings = [
    ...availableBindings,
    ...environmentBindings,
    ...userBindings,
    ...settingBindings,
  ]

  onMount(() => {
    // Register the trigger as the focus element for the automation
    // Onload, the canvas will use the dimensions to center the step
    if (stepEle && step.type === "TRIGGER" && !$view.focusEle) {
      const { width, height, left, right, top, bottom, x, y } =
        stepEle.getBoundingClientRect()
      view.update(state => ({
        ...state,
        focusEle: {
          width,
          height,
          left,
          right,
          top,
          bottom,
          x,
          y,
          ...(step.type === "TRIGGER" ? { targetY: 100 } : {}),
        },
      }))
    }
  })
</script>

{#if isBranch}
  <div class="split-branch-btn">
    <ActionButton
      disabled={viewMode === ViewMode.LOGS}
      icon="plus-circle"
      on:click={() => {
        automationStore.actions.branchAutomation(pathToCurrentNode, automation)
      }}
    >
      Add branch
    </ActionButton>
  </div>
  <div class="branched">
    {#each branches as branch, bIdx}
      {@const leftMost = bIdx === 0}
      {@const rightMost = branches?.length - 1 === bIdx}
      {@const isBranchExecuted = executedBranchId === branch.id}
      {@const isBranchUnexecuted =
        viewMode === ViewMode.LOGS && executedBranchId && !isBranchExecuted}
      <div class="branch-wrap">
        <div
          class="branch"
          class:left={leftMost}
          class:right={rightMost}
          class:middle={!leftMost && !rightMost}
          class:executed={isBranchExecuted}
          class:unexecuted={isBranchUnexecuted}
        >
          <div class="branch-node">
            <BranchNode
              {automation}
              {step}
              {bindings}
              pathTo={pathToCurrentNode}
              branchIdx={bIdx}
              isLast={rightMost}
              executed={isBranchExecuted}
              unexecuted={isBranchUnexecuted}
              {viewMode}
              {logStepData}
              {onStepSelect}
              isLastBranchStep={isLast && isBranch}
              on:change={async e => {
                const updatedBranch = { ...branch, ...e.detail }

                if (!step?.inputs?.branches?.[bIdx]) {
                  console.error(`Cannot load target branch: ${bIdx}`)
                  return
                }

                let branchStepUpdate = cloneDeep(step)
                branchStepUpdate.inputs.branches[bIdx] = updatedBranch

                // Ensure valid base configuration for all branches
                // Reinitialise empty branch conditions on update
                branchStepUpdate.inputs.branches.forEach(
                  (branch, i, branchArray) => {
                    if (!Object.keys(branch.condition).length) {
                      branchArray[i] = {
                        ...branch,
                        ...automationStore.actions.generateDefaultConditions(),
                      }
                    }
                  }
                )

                const updated = automationStore.actions.updateStep(
                  blockRef?.pathTo,
                  automation,
                  branchStepUpdate
                )

                try {
                  await automationStore.actions.save(updated)
                } catch (e) {
                  notifications.error("Error saving branch update")
                  console.error("Error saving automation branch", e)
                }
              }}
            />
          </div>

          <!-- Branch steps -->
          {#each step.inputs?.children[branch.id] || [] as bStep, sIdx}
            {@const branchSteps = step.inputs?.children[branch.id] || []}
            {@const isBranchStepLast = sIdx === branchSteps.length - 1}
            <!-- Recursive StepNode -->
            <svelte:self
              step={bStep}
              stepIdx={sIdx}
              branchIdx={bIdx}
              isLast={viewMode === ViewMode.LOGS
                ? isBranchStepLast
                : blockRef?.terminating || false}
              pathTo={pathToCurrentNode}
              {automation}
              {blocks}
              {logData}
              {viewMode}
              {selectedLogStepId}
              {onStepSelect}
            />
          {/each}
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="block" bind:this={stepEle}>
    <FlowItem
      block={step}
      idx={stepIdx}
      {blockRef}
      {isLast}
      {automation}
      {bindings}
      draggable={step.type !== "TRIGGER"}
      {logStepData}
      {viewMode}
      {selectedLogStepId}
      {onStepSelect}
      unexecuted={isBranchUnexecuted}
    />
  </div>
{/if}

<style>
  .branch-wrap {
    width: inherit;
  }

  .branch {
    display: flex;
    align-items: center;
    flex-direction: column;
    position: relative;
    width: inherit;
  }

  .branched {
    display: flex;
    gap: 64px;
  }

  .branch::before {
    height: 64px;
    border-left: 1px dashed var(--grey-4);
    border-top: 1px dashed var(--grey-4);
    content: "";
    color: var(--grey-4);
    width: 50%;
    position: absolute;
    left: 50%;
    top: -16px;
  }

  .branch.left::before {
    color: var(--grey-4);
    width: calc(50% + 62px);
  }

  .branch.middle::after {
    height: 64px;
    border-top: 1px dashed var(--grey-4);
    content: "";
    color: var(--grey-4);
    width: calc(50% + 62px);
    position: absolute;
    left: 50%;
    top: -16px;
  }

  .branch.right::before {
    left: 0px;
    border-right: 1px dashed var(--grey-4);
    border-left: none;
  }

  .branch.middle::before {
    left: 0px;
    border-right: 1px dashed var(--grey-4);
    border-left: none;
  }

  .branch-node {
    margin-top: 48px;
  }

  .split-branch-btn {
    z-index: 2;
  }

  /* Branch execution states in logs mode */

  .branch.unexecuted {
    opacity: 0.7;
  }

  .branch.unexecuted::before,
  .branch.unexecuted::after {
    opacity: 0.7;
  }

  .unexecuted {
    opacity: 0.7;
  }
</style>
