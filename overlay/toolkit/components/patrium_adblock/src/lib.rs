/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use adblock::lists::{FilterSet, ParseOptions};
use adblock::request::Request;
use adblock::Engine;
use nserror::{nsresult, NS_ERROR_FAILURE, NS_ERROR_NOT_INITIALIZED, NS_OK};
use nsstring::{nsACString, nsAString, nsCString, nsString};
use std::cell::RefCell;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use thin_vec::ThinVec;
use xpcom::interfaces::{nsIPatriumAdblock, nsIPatriumAdblockCallback};
use xpcom::{xpcom, xpcom_method, RefPtr};

#[xpcom(implement(nsIPatriumAdblock), nonatomic)]
pub struct PatriumAdblock {
    engine: RefCell<Option<Engine>>,
}

type BuildResult = Result<Engine, String>;

fn to_path(s: &nsAString) -> PathBuf {
    PathBuf::from(String::from_utf16_lossy(&s[..]))
}

impl PatriumAdblock {
    fn new() -> RefPtr<PatriumAdblock> {
        PatriumAdblock::allocate(InitPatriumAdblock {
            engine: RefCell::new(None),
        })
    }

    fn finish(
        this: RefPtr<PatriumAdblock>,
        callback: RefPtr<nsIPatriumAdblockCallback>,
        task: moz_task::AsyncTask<BuildResult>,
    ) {
        moz_task::spawn_local("PatriumAdblock::Finish", async move {
            match task.await {
                Ok(engine) => {
                    this.engine.replace(Some(engine));
                    unsafe { callback.OnComplete(NS_OK, &*nsCString::new()) };
                }
                Err(err) => {
                    unsafe { callback.OnComplete(NS_ERROR_FAILURE, &*nsCString::from(err)) };
                }
            };
        })
        .detach();
    }

    xpcom_method!(get_ready => GetReady() -> bool);
    fn get_ready(&self) -> Result<bool, nsresult> {
        Ok(self.engine.borrow().is_some())
    }

    xpcom_method!(build => Build(list_paths: *const ThinVec<nsString>, engine_path: *const nsAString, callback: *const nsIPatriumAdblockCallback));
    fn build(
        &self,
        list_paths: &ThinVec<nsString>,
        engine_path: &nsAString,
        callback: &nsIPatriumAdblockCallback,
    ) -> Result<(), nsresult> {
        let list_paths: Vec<PathBuf> = list_paths.iter().map(|p| to_path(p)).collect();
        let engine_path = to_path(engine_path);
        let task = moz_task::spawn_blocking("PatriumAdblock::Build", async move {
            let mut set = FilterSet::new(false);
            let mut loaded = 0;
            for path in list_paths {
                if let Ok(text) = fs::read_to_string(&path) {
                    set.add_filter_list(text, ParseOptions::default());
                    loaded += 1;
                }
            }
            if loaded == 0 {
                return Err("no filter lists available".to_string());
            }
            let engine = Engine::new_with_filter_set(set);
            let tmp = engine_path.with_extension("tmp");
            fs::write(&tmp, engine.serialize())
                .and_then(|_| fs::rename(&tmp, &engine_path))
                .map_err(|e| format!("saving engine: {}", e))?;
            Ok(engine)
        });
        Self::finish(RefPtr::new(self), RefPtr::new(callback), task);
        Ok(())
    }

    xpcom_method!(load => Load(engine_path: *const nsAString, callback: *const nsIPatriumAdblockCallback));
    fn load(
        &self,
        engine_path: &nsAString,
        callback: &nsIPatriumAdblockCallback,
    ) -> Result<(), nsresult> {
        let engine_path = to_path(engine_path);
        let task = moz_task::spawn_blocking("PatriumAdblock::Load", async move {
            let data = fs::read(&engine_path).map_err(|e| e.to_string())?;
            let mut engine = Engine::default();
            engine
                .deserialize(&data)
                .map_err(|e| format!("{:?}", e))?;
            Ok(engine)
        });
        Self::finish(RefPtr::new(self), RefPtr::new(callback), task);
        Ok(())
    }

    xpcom_method!(should_block => ShouldBlock(url: *const nsACString, source_url: *const nsACString, request_type: *const nsACString) -> bool);
    fn should_block(
        &self,
        url: &nsACString,
        source_url: &nsACString,
        request_type: &nsACString,
    ) -> Result<bool, nsresult> {
        let engine = self.engine.borrow();
        let Some(engine) = engine.as_ref() else {
            return Ok(false);
        };
        let request = match Request::new(
            &url.to_utf8(),
            &source_url.to_utf8(),
            &request_type.to_utf8(),
            "GET",
        ) {
            Ok(r) => r,
            Err(_) => return Ok(false),
        };
        Ok(engine.check_network_request(&request).should_block())
    }

    xpcom_method!(cosmetic_resources => CosmeticResources(url: *const nsACString) -> nsACString);
    fn cosmetic_resources(&self, url: &nsACString) -> Result<nsCString, nsresult> {
        let engine = self.engine.borrow();
        let engine = engine.as_ref().ok_or(NS_ERROR_NOT_INITIALIZED)?;
        let res = engine.url_cosmetic_resources(&url.to_utf8());
        let json = serde_json::json!({
            "hide": res.hide_selectors,
            "exceptions": res.exceptions,
            "generichide": res.generichide,
        });
        Ok(nsCString::from(json.to_string()))
    }

    xpcom_method!(hidden_selectors => HiddenSelectors(classes: *const ThinVec<nsCString>, ids: *const ThinVec<nsCString>, exceptions: *const ThinVec<nsCString>) -> ThinVec<nsCString>);
    fn hidden_selectors(
        &self,
        classes: &ThinVec<nsCString>,
        ids: &ThinVec<nsCString>,
        exceptions: &ThinVec<nsCString>,
    ) -> Result<ThinVec<nsCString>, nsresult> {
        let engine = self.engine.borrow();
        let engine = engine.as_ref().ok_or(NS_ERROR_NOT_INITIALIZED)?;
        let exceptions: HashSet<String> = exceptions
            .iter()
            .map(|e| e.to_utf8().into_owned())
            .collect();
        let selectors = engine.hidden_class_id_selectors(
            classes.iter().map(|c| c.to_utf8().into_owned()),
            ids.iter().map(|i| i.to_utf8().into_owned()),
            &exceptions,
        );
        Ok(selectors.into_iter().map(nsCString::from).collect())
    }
}

#[no_mangle]
pub unsafe extern "C" fn patrium_adblock_construct(result: &mut *const nsIPatriumAdblock) {
    let inst: RefPtr<PatriumAdblock> = PatriumAdblock::new();
    *result = inst.coerce::<nsIPatriumAdblock>();
    std::mem::forget(inst);
}
