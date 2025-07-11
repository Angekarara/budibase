<script>
  import { Icon, Input, Drawer, Button } from "@budibase/bbui"
  import {
    readableToRuntimeBinding,
    runtimeToReadableBinding,
  } from "@/dataBinding"
  import { FieldType } from "@budibase/types"

  import ClientBindingPanel from "@/components/common/bindings/ClientBindingPanel.svelte"
  import { createEventDispatcher, setContext } from "svelte"
  import { isJSBinding, findHBSBlocks } from "@budibase/string-templates"

  export let panel = ClientBindingPanel
  export let value = ""
  export let bindings = []
  export let title = "Bindings"
  export let placeholder = undefined
  export let label = undefined
  export let disabled = false
  export let allowJS = true
  export let allowHelpers = true
  export let updateOnChange = true
  export let type = undefined
  export let schema = undefined
  export let showComponent = false

  export let allowHBS = true
  export let context = {}

  const dispatch = createEventDispatcher()
  let bindingDrawer
  let currentVal = value

  let attachmentTypes = [
    FieldType.ATTACHMENT_SINGLE,
    FieldType.ATTACHMENTS,
    FieldType.SIGNATURE_SINGLE,
  ]

  $: readableValue = runtimeToReadableBinding(bindings, value)
  $: tempValue = readableValue
  $: isJS = isJSBinding(value)

  const saveBinding = () => {
    onChange(tempValue)
    onBlur()
    bindingDrawer.hide()
  }

  setContext("binding-drawer-actions", {
    save: saveBinding,
  })

  const onChange = value => {
    if (
      (type === "link" || type === "bb_reference") &&
      value &&
      hasValidLinks(value)
    ) {
      currentVal = value.split(",")
    } else if (type === "array" && value && hasValidOptions(value)) {
      currentVal = value.split(",")
    } else {
      currentVal = readableToRuntimeBinding(bindings, value)
    }
    dispatch("change", currentVal)
  }

  const onBlur = () => {
    dispatch("blur", currentVal)
  }

  const isValidDate = value => {
    return !value || !isNaN(new Date(value).valueOf())
  }

  const hasValidLinks = value => {
    let links = []
    if (Array.isArray(value)) {
      links = value
    } else if (value && typeof value === "string") {
      links = value.split(",")
    } else {
      return !value
    }

    return links.every(link => link.startsWith("ro_"))
  }

  const hasValidOptions = value => {
    let links = []
    if (Array.isArray(value)) {
      links = value
    } else if (value && typeof value === "string") {
      links = value.split(",")
    } else {
      return !value
    }
    return links.every(link => schema?.constraints?.inclusion?.includes(link))
  }

  const isValidBoolean = value => {
    return value === "false" || value === "true" || value == ""
  }

  const validationMap = {
    date: isValidDate,
    datetime: isValidDate,
    link: hasValidLinks,
    bb_reference: hasValidLinks,
    bb_reference_single: hasValidLinks,
    array: hasValidOptions,
    longform: value => !isJSBinding(value),
    json: value => !isJSBinding(value),
    options: value => !isJSBinding(value) && !findHBSBlocks(value)?.length,
    boolean: isValidBoolean,
    attachment: false,
    attachment_single: false,
    signature_single: false,
  }

  const isValid = value => {
    const validate = validationMap[type]
    return validate ? validate(value) : true
  }

  const getIconClass = (value, type) => {
    if (type === "longform" && !isJSBinding(value)) {
      return "text-area-slot-icon"
    }
    if (type === "json" && !isJSBinding(value)) {
      return "json-slot-icon"
    }
    if (
      ![
        "string",
        "number",
        "bigint",
        "barcodeqr",
        "attachment",
        "signature_single",
        "attachment_single",
      ].includes(type)
    ) {
      return "slot-icon"
    }
    return ""
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="control" class:disabled>
  {#if !isValid(value) && !showComponent}
    <Input
      {label}
      {disabled}
      readonly={isJS}
      value={isJS ? "(JavaScript function)" : readableValue}
      on:change={event => onChange(event.detail)}
      on:blur={onBlur}
      {placeholder}
      {updateOnChange}
    />
    <div
      class="icon close"
      on:click={() => {
        if (!isJS) {
          dispatch("change", "")
        }
      }}
    >
      <Icon disabled={isJS} size="S" name="x" />
    </div>
  {:else}
    <slot />
  {/if}
  {#if !disabled && type !== "formula" && !attachmentTypes.includes(type)}
    <div
      class={`icon ${getIconClass(value, type)}`}
      on:click={() => {
        bindingDrawer.show()
      }}
    >
      <Icon size="S" weight="fill" name="lightning" />
    </div>
  {/if}
</div>
<Drawer
  on:drawerHide
  on:drawerShow
  bind:this={bindingDrawer}
  title={title ?? placeholder ?? "Bindings"}
>
  <Button cta slot="buttons" on:click={saveBinding}>Save</Button>
  <svelte:component
    this={panel}
    slot="body"
    value={readableValue}
    on:change={event => (tempValue = event.detail)}
    {bindings}
    {allowJS}
    {allowHBS}
    {allowHelpers}
    {context}
  />
</Drawer>

<style>
  .control {
    flex: 1;
    position: relative;
  }

  .slot-icon {
    right: 34px !important;
    border-right: 1px solid var(--spectrum-alias-border-color);
    border-top-right-radius: 0px !important;
    border-bottom-right-radius: 0px !important;
  }

  .icon.close {
    right: 1px !important;
    border-right: none;
    border-top-right-radius: 4px !important;
    border-bottom-right-radius: 4px !important;
  }

  .text-area-slot-icon,
  .json-slot-icon {
    right: 1px !important;
    border-bottom: 1px solid var(--spectrum-alias-border-color);
    border-top-right-radius: 4px !important;
    border-bottom-right-radius: 0px !important;
    border-bottom-left-radius: 4px !important;
    top: 1px;
  }

  .icon {
    bottom: 1px;
    position: absolute;
    justify-content: center;
    align-items: center;
    display: flex;
    flex-direction: row;
    box-sizing: border-box;
    border-left: 1px solid var(--spectrum-alias-border-color);
    width: 34px;
    color: var(--spectrum-alias-text-color);
    background-color: var(--spectrum-global-color-gray-75);
    transition:
      background-color var(--spectrum-global-animation-duration-100, 130ms),
      box-shadow var(--spectrum-global-animation-duration-100, 130ms),
      border-color var(--spectrum-global-animation-duration-100, 130ms);
    height: calc(var(--spectrum-alias-item-height-m) - 2px);
  }

  .icon:hover {
    cursor: pointer;
    color: var(--spectrum-alias-text-color-hover);
    background-color: var(--spectrum-global-color-gray-50);
    border-color: var(--spectrum-alias-border-color-hover);
  }

  .control:not(.disabled) :global(.spectrum-Textfield-input) {
    padding-right: 40px;
  }
</style>
