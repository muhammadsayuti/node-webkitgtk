#include "utils.h"

using namespace v8;

Nan::Utf8String *getOptStr(Handle<Object> opts, const gchar *name) {
	Local<Value> opt = opts->Get(H(name));
	Local<Value> empty;
	Nan::Utf8String *str = new Nan::Utf8String(opt->IsString() ? opt : empty);
	return str;
}

Nan::Callback *getCb(Handle<Object> opts, const gchar *name) {
	Nan::Callback *cb = NULL;
	if (opts->Has(H(name))) {
		Local<Value> opt = opts->Get(H(name));
		if (opt->IsFunction()) {
			cb = new Nan::Callback(opt.As<Function>());
		}
	}
	return cb;
}
GtkWindowType getType(int type) {
	switch (type) {
	case 0:
		return GTK_WINDOW_POPUP;
	case 1:
	default:
		return GTK_WINDOW_TOPLEVEL;
	}
}
GdkWindowTypeHint getTypeHint(int type) {
	switch (type) {
	case 0:
		return GDK_WINDOW_TYPE_HINT_DESKTOP;
	case 1:
		return GDK_WINDOW_TYPE_HINT_DOCK;
	case 2:
		return GDK_WINDOW_TYPE_HINT_TOOLBAR;
	case 3:
		return GDK_WINDOW_TYPE_HINT_MENU;
	case 4:
		return GDK_WINDOW_TYPE_HINT_UTILITY;
	case 5:
		return GDK_WINDOW_TYPE_HINT_SPLASHSCREEN;
	case 6:
		return GDK_WINDOW_TYPE_HINT_DIALOG;
	case 7:
		return GDK_WINDOW_TYPE_HINT_DROPDOWN_MENU;
	case 8:
		return GDK_WINDOW_TYPE_HINT_POPUP_MENU;
	case 9:
		return GDK_WINDOW_TYPE_HINT_TOOLTIP;
	case 10:
		return GDK_WINDOW_TYPE_HINT_NOTIFICATION;
	case 11:
		return GDK_WINDOW_TYPE_HINT_COMBO;
	case 12:
		return GDK_WINDOW_TYPE_HINT_DND;
	case 13:
	default:
		return GDK_WINDOW_TYPE_HINT_NORMAL;
	}
}
// actually, the dict is a (key, arrayOfStrings) map
void update_soup_headers_with_dict(SoupMessageHeaders *headers,
                                   GVariant *dict) {
	if (headers == NULL)
		return;
	GVariantIter iter;
	GVariant *val = NULL;
	gchar *key;

	g_variant_iter_init(&iter, dict);
	while (g_variant_iter_next(&iter, "{sv}", &key, &val)) {
		if (val == NULL) {
			soup_message_headers_remove(headers, key);
		} else {
			soup_message_headers_replace(headers, key,
			                             g_variant_get_string(val, NULL));
		}
		g_variant_unref(val);
		g_free(key);
	}
}

GVariant *soup_headers_to_gvariant_dict(SoupMessageHeaders *headers) {
	GVariantBuilder builder;
	g_variant_builder_init(&builder, G_VARIANT_TYPE_VARDICT);
	if (headers != NULL) {
		SoupMessageHeadersIter iter;
		soup_message_headers_iter_init(&iter, headers);
		while (true) {
			const char *name;
			const char *value;
			if (!soup_message_headers_iter_next(&iter, &name, &value))
				break;
			g_variant_builder_add(&builder, "{sv}", name,
			                      g_variant_new_string(value));
		}
	}
	return g_variant_builder_end(&builder);
}
