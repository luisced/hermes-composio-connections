import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');});
test('palette_registration_has_native_command_contract',async({page})=>{
  await expect(page.getByTestId('connection-row')).toHaveCount(3);
  const command=await page.evaluate(()=>{const d=window.registrations.find(x=>x.area==='palette').data;return {label:d.label,run:typeof d.run,id:d.id}});
  expect(command).toEqual({id:'composio-connections.open',label:'Abrir conexiones de Composio',run:'function'});
});
test('same_profile_activation_clears_data_and_recovers',async({page})=>{
  await expect(page.getByTestId('connection-row')).toHaveCount(3);
  await page.getByRole('button',{name:'Desconectar gmail_one'}).click();
  await page.evaluate(()=>{window.fixture.rows=[];window.sameProfileSwap()});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('connection-row')).toHaveCount(0);
  await page.evaluate(()=>window.fixture.rows=[{key:'gmail:fresh',selector:'fresh',toolkit:'gmail',status:'ACTIVE',alias:null,removable:true}]);
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.getByTestId('connection-row')).toHaveCount(1);
});
test('concurrent_singleton_without_opening_link_is_not_correlated',async({page})=>{
  await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
  await page.getByLabel('Servicio (slug)').fill('notion');
  await page.getByLabel('Alias de la nueva cuenta').fill('personal');
  await page.getByRole('button',{name:'Generar autorización'}).click();
  await expect(page.getByRole('button',{name:'Abrir autorización'})).toBeVisible();
  await page.evaluate(()=>window.fixture.rows.push({key:'notion:new',selector:'new',toolkit:'notion',status:'ACTIVE',removable:true}));
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.getByText('Conectada en Composio',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('autorización no correlacionada');
  await expect(page.getByRole('button',{name:'Abrir autorización'})).toBeVisible();
});
const connect=async page=>{await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();await page.getByLabel('Servicio (slug)').fill('gmail');await page.getByLabel('Alias de la nueva cuenta').fill('second');await page.getByRole('button',{name:'Generar autorización'}).click()};

test('shows_every_row_including_expired',async({page})=>{await expect(page.getByTestId('connection-row')).toHaveCount(3);await expect(page.getByTestId('connection-row').getByText('Expirada',{exact:true})).toBeVisible()});
test('filters_are_explicit',async({page})=>{await page.getByLabel('Buscar conexiones').fill('work');await expect(page.getByTestId('connection-row')).toHaveCount(1);await page.getByLabel('Buscar conexiones').fill('');await expect(page.getByTestId('connection-row')).toHaveCount(3)});
test('switch_scope_clears_private_rows',async({page})=>{await expect(page.getByTestId('connection-row')).toHaveCount(3);await page.getByRole('button',{name:'Desconectar gmail_one'}).click();await page.evaluate(()=>window.changeScope());await expect(page.getByTestId('connection-row')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0)});
test('late_mutation_does_not_open_old_oauth',async({page})=>{await page.evaluate(()=>window.fixture.delay=300);await connect(page);await page.evaluate(()=>window.changeScope());await page.waitForTimeout(500);expect(await page.evaluate(()=>window.fixture.opened)).toEqual([]);await expect(page.getByRole('button',{name:'Abrir autorización'})).toHaveCount(0)});
test('prior_active_account_does_not_confirm_oauth',async({page})=>{await connect(page);await expect(page.getByRole('button',{name:'Abrir autorización'})).toBeVisible();await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.getByText('Conectada en Composio',{exact:true})).toHaveCount(0)});
test('disconnect_requires_exact_confirmation',async({page})=>{await page.getByRole('button',{name:'Desconectar gmail_one'}).click();const d=page.getByRole('dialog');await expect(d.getByText('gmail_one',{exact:true})).toBeVisible();await d.getByRole('button',{name:'Cancelar'}).click();expect(await page.evaluate(()=>window.fixture.calls.filter(x=>x.path==='/disconnect').length)).toBe(0);await page.getByRole('button',{name:'Desconectar gmail_two'}).click();await page.getByRole('button',{name:'Confirmar desconexión'}).click();await expect(page.getByTestId('connection-row')).toHaveCount(2);expect(await page.evaluate(()=>window.fixture.calls.find(x=>x.path==='/disconnect').body)).toEqual({selector:'gmail_two',confirmed:true})});
test('double_click_sends_once',async({page})=>{await page.evaluate(()=>window.fixture.delay=300);await connect(page);await expect.poll(()=>page.evaluate(()=>window.fixture.calls.filter(x=>x.path==='/connect').length)).toBe(1);await expect(page.getByRole('button',{name:'Generar autorización'})).toBeDisabled()});
test('refresh_removes_deleted_rows',async({page})=>{await expect(page.getByTestId('connection-row')).toHaveCount(3);await page.evaluate(()=>window.fixture.rows.pop());await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.getByTestId('connection-row')).toHaveCount(2)});
test('catalog_supports_manual_slug',async({page})=>{await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();await expect(page.getByText(/Catálogo de servicios de Composio/)).toBeVisible();await page.getByLabel('Servicio (slug)').fill('notion');await expect(page.getByLabel('Servicio (slug)')).toHaveValue('notion')});
test('plain_namespace_404_and_structured_errors_distinguished',async({page})=>{await expect(page.getByTestId('connection-row')).toHaveCount(3);await page.evaluate(()=>window.fixture.error='404: Not Found');await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('backend');await page.evaluate(()=>window.fixture.error='404: {"error":{"code":"account-changed","message":"changed"}}');await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('cuenta cambió')});
test('screenshots_fixture_and_resize',async({page})=>{await expect(page.getByTestId('connection-row')).toHaveCount(3);await page.screenshot({path:'test-results/fixture-wide.png'});await page.setViewportSize({width:420,height:800});await expect(page.getByTestId('connection-row')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/fixture-narrow.png'})});
