<script lang="ts">
  import { goto } from "@roxi/routify"
  import NamePanel from "./_components/NamePanel.svelte"
  import ExampleApp from "./_components/ExampleApp.svelte"
  import { notifications } from "@budibase/bbui"
  import { SplitPage } from "@budibase/frontend-core"
  import { API } from "@/api"
  import { auth, admin } from "@/stores/portal"
  import type { CreateAppRequest } from "@budibase/types"

  let name: string = "My first app"
  let url: string = "my-first-app"
  let appId: string | null = null

  let loading = false

  const createApp = async () => {
    loading = true

    const data: CreateAppRequest = {
      name: name.trim(),
      url: url.trim(),
      useTemplate: false,
    }

    const createdApp = await API.createApp(data)

    // Update checklist - in case first app
    await admin.init()

    // Create user
    await auth.setInitInfo({})

    appId = createdApp.instance._id
    return createdApp
  }

  const goToApp = () => {
    $goto(`/builder/app/${appId}`)
    notifications.success(`App created successfully`)
  }

  const handleCreateApp = async () => {
    try {
      await createApp()

      goToApp()
    } catch (e: any) {
      loading = false
      notifications.error(e.message || "There was a problem creating your app")
    }
  }
</script>

<div class="full-width">
  <SplitPage>
    <NamePanel bind:name bind:url disabled={loading} onNext={handleCreateApp} />
    <div slot="right">
      <ExampleApp {name} />
    </div>
  </SplitPage>
</div>

<style>
  .full-width {
    width: 100%;
  }
</style>
