import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('connection-row')).toHaveCount(3)});
test('filtered_empty_does_not_claim_no_accounts',async({page})=>{
 await page.getByLabel('Estado de conexión',{exact:true}).selectOption('EXPIRED');
 await page.getByLabel('Buscar conexiones').fill('personal');
 await expect(page.getByText('No hay coincidencias. Limpia los filtros y la búsqueda para ver todas tus cuentas.',{exact:true})).toBeVisible();
 await expect(page.getByText('No hay conexiones en este contexto de Composio.',{exact:true})).toHaveCount(0);
});
test('additional_alias_validation_is_local_accessible_and_prevents_post',async({page})=>{
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await page.getByLabel('Servicio (slug)').fill('gmail');
 const alias=page.getByLabel('Alias de la nueva cuenta');
 await page.getByRole('button',{name:'Generar autorización'}).click();
 await expect(alias).toHaveAttribute('aria-invalid','true');await expect(alias).toBeFocused();
 await alias.fill('personal');await page.getByRole('button',{name:'Generar autorización'}).click();
 await expect(page.getByRole('alert')).toContainText('Ese alias ya existe');
 expect(await page.evaluate(()=>window.fixture.calls.filter(x=>x.path==='/connect'))).toHaveLength(0);
});
test('stopping_wait_is_not_oauth_revocation_and_does_not_claim_polling',async({page})=>{
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await page.getByLabel('Servicio (slug)').fill('notion');await page.getByRole('button',{name:'Generar autorización'}).click();
 await page.getByRole('button',{name:'Dejar de esperar'}).click();
 await expect(page.getByRole('status')).toContainText('Seguimiento detenido');
 await expect(page.getByRole('status')).not.toContainText('comprobará');
 await expect(page.getByRole('button',{name:'Abrir autorización'})).toHaveCount(0);
});
test('additional_account_that_becomes_singleton_does_not_falsely_correlate',async({page})=>{
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await page.getByLabel('Servicio (slug)').fill('gmail');await page.getByLabel('Alias de la nueva cuenta').fill('new');
 await page.getByRole('button',{name:'Generar autorización'}).click();
 await page.evaluate(()=>window.fixture.rows=[{key:'gmail:new',selector:'new',toolkit:'gmail',alias:null,status:'ACTIVE',removable:true}]);
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('autorización no correlacionada');
 await expect(page.getByRole('button',{name:'Abrir autorización'})).toBeVisible();
});
test('mobile_catalog_filters_disclose_and_tabs_announce_selection',async({page})=>{
 await page.setViewportSize({width:420,height:900});await page.reload();
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await expect(page.getByRole('button',{name:'Conectar servicio',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByLabel('Categoría',{exact:true})).toBeHidden();
 const button=page.getByRole('button',{name:'Filtros',exact:true});
 await expect(button).toHaveAttribute('aria-expanded','false');await button.click();
 await expect(page.getByLabel('Categoría',{exact:true})).toBeVisible();
 await button.click();await expect(page.getByLabel('Catálogo de servicios',{exact:true}).getByRole('button').first()).toBeVisible();
});
