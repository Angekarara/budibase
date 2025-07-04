<script>
  import { isActive, redirect, goto, url } from "@roxi/routify"
  import { Icon, notifications, Tabs, Tab } from "@budibase/bbui"
  import {
    organisation,
    auth,
    menu,
    appsStore,
    licensing,
    admin,
  } from "@/stores/portal"
  import { onMount } from "svelte"
  import UpgradeButton from "./_components/UpgradeButton.svelte"
  import MobileMenu from "./_components/MobileMenu.svelte"
  import Logo from "./_components/Logo.svelte"
  import UserDropdown from "./_components/UserDropdown.svelte"
  import HelpMenu from "@/components/common/HelpMenu.svelte"
  import { sdk } from "@budibase/shared-core"
  import EnterpriseBasicTrialBanner from "@/components/portal/licensing/EnterpriseBasicTrialBanner.svelte"
  import { Constants } from "@budibase/frontend-core"

  let loaded = false
  let mobileMenuVisible = false
  let activeTab = "Apps"

  $: $url(), updateActiveTab($menu)
  $: isOnboarding =
    !$appsStore.apps.length && sdk.users.hasBuilderPermissions($auth.user)
  $: isOwner = $auth.accountPortalAccess && $admin.cloud

  const updateActiveTab = menu => {
    for (let entry of menu) {
      if ($isActive(entry.href)) {
        if (activeTab !== entry.title) {
          activeTab = entry.title
        }
        break
      }
    }
  }

  const showMobileMenu = () => (mobileMenuVisible = true)
  const hideMobileMenu = () => (mobileMenuVisible = false)

  const showFreeTrialBanner = () => {
    return (
      $licensing.license?.plan?.type ===
        Constants.PlanType.ENTERPRISE_BASIC_TRIAL && isOwner
    )
  }

  onMount(async () => {
    // Prevent non-builders from accessing the portal
    if ($auth.user) {
      if (!sdk.users.hasBuilderPermissions($auth.user)) {
        $redirect("../")
      } else {
        try {
          // We need to load apps to know if we need to show onboarding fullscreen
          await Promise.all([appsStore.load(), organisation.init()])
        } catch (error) {
          notifications.error("Error getting org config")
        }
        loaded = true
      }
    }
  })
</script>

{#if $auth.user && loaded}
  {#if isOnboarding}
    <slot />
  {:else}
    <HelpMenu />
    <div class="container">
      <EnterpriseBasicTrialBanner show={showFreeTrialBanner()} />
      <div class="nav">
        <div class="branding">
          <Logo />
        </div>
        <div class="desktop">
          <Tabs selected={activeTab}>
            {#each $menu as { title, href }}
              <Tab {title} on:click={() => $goto(href)} />
            {/each}
          </Tabs>
        </div>
        <div class="mobile">
          <Icon hoverable name="list-bullets" on:click={showMobileMenu} />
        </div>
        <div class="desktop">
          <UpgradeButton />
        </div>
        <div class="dropdown">
          <UserDropdown />
        </div>
      </div>
      <div class="main">
        <slot />
      </div>
      <MobileMenu visible={mobileMenuVisible} on:close={hideMobileMenu} />
    </div>
  {/if}
{/if}

<style>
  .container {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
  }
  .nav {
    background: var(--background);
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    border-bottom: var(--border-light);
    padding: 0 var(--spacing-l);
    gap: 24px;
    position: relative;
  }

  /* Customise tabs appearance*/
  .nav :global(.spectrum-Tabs) {
    margin-bottom: -2px;
    padding: 5px 0;
    flex: 1 1 auto;
  }
  .nav :global(.spectrum-Tabs-content) {
    display: none;
  }
  .nav :global(.spectrum-Tabs-itemLabel) {
    font-weight: 600;
  }

  .branding {
    display: grid;
    place-items: center;
  }
  .main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: stretch;
    overflow: auto;
  }
  .mobile {
    display: none;
  }
  .desktop {
    display: contents;
  }

  @media (max-width: 640px) {
    .mobile {
      display: contents;
    }
    .desktop {
      display: none;
    }
    .nav {
      flex: 0 0 52px;
      justify-content: space-between;
    }
    .branding {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translateX(-50%) translateY(-50%);
    }
  }
</style>
