import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('connection-row')).toHaveCount(3)});
test('failed_disconnect_is_announced_inside_native_modal_accessibility_tree',async({page,context})=>{
 await page.getByRole('button',{name:'Desconectar gmail_one',exact:true}).click();
 await page.evaluate(()=>window.fixture.error='409: {"error":{"code":"removal-unverified"}}');
 await page.getByRole('button',{name:'Confirmar desconexión',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('alert')).toContainText('La cuenta todavía aparece en Composio');
 const cdp=await context.newCDPSession(page);
 const tree=await cdp.send('Accessibility.getFullAXTree');
 expect(tree.nodes.some(n=>!n.ignored&&String(n.name?.value).includes('La cuenta todavía aparece en Composio'))).toBe(true);
 await cdp.detach();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
test('switching_service_clears_stale_required_alias_error',async({page})=>{
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await page.getByLabel('Servicio (slug)').fill('gmail');
 await page.getByRole('button',{name:'Generar autorización'}).click();
 const alias=page.getByLabel('Alias de la nueva cuenta');
 await expect(alias).toHaveAttribute('aria-invalid','true');
 await page.getByLabel('Servicio (slug)').fill('notion');
 await expect(alias).toHaveAttribute('aria-invalid','false');await expect(alias).toHaveAttribute('aria-required','false');
 await expect(page.getByText('Escribe un alias para distinguir esta cuenta adicional.',{exact:true})).toHaveCount(0);
});
