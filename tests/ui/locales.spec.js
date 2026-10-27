import {test,expect} from '@playwright/test';
test('ui_follows_document_language_and_falls_back_to_english',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Mis conexiones',exact:true})).toBeVisible();
 await page.evaluate(()=>{document.documentElement.lang='en'});
 await expect(page.getByRole('button',{name:'My connections',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Connect a service',exact:true})).toBeVisible();
 await page.evaluate(()=>{document.documentElement.lang='ja'});
 await expect(page.getByRole('button',{name:'自分の接続',exact:true})).toBeVisible();
 await page.evaluate(()=>{document.documentElement.lang='ar'});
 await expect(page.getByRole('button',{name:'اتصالاتي',exact:true})).toBeVisible();
 await page.evaluate(()=>{document.documentElement.lang='pl'});
 await expect(page.getByRole('button',{name:'My connections',exact:true})).toBeVisible();
});
