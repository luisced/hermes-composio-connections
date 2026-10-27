import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('connection-row')).toHaveCount(3)});
test('mobile_disconnect_is_modal_traps_focus_and_restores_without_mutation',async({page})=>{
 await page.setViewportSize({width:390,height:700});
 const trigger=page.getByRole('button',{name:'Desconectar gmail_one',exact:true});
 await trigger.click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toHaveAttribute('aria-modal','true');
 const cancel=dialog.getByRole('button',{name:'Cancelar',exact:true});
 const confirm=dialog.getByRole('button',{name:'Confirmar desconexión',exact:true});
 await expect(cancel).toBeFocused();
 const bounds=await dialog.boundingBox();
 expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(700);
 await page.keyboard.press('Shift+Tab');await expect(confirm).toBeFocused();
 await page.keyboard.press('Tab');await expect(cancel).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 await trigger.click();await cancel.click();await expect(trigger).toBeFocused();
 expect(await page.evaluate(()=>window.fixture.calls.filter(x=>x.path==='/disconnect'))).toEqual([]);
});
