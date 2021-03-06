{
    'targets': [
        {
            'target_name': 'webkit-gtk',
            'conditions': [
                ['OS=="linux"', {
                    'sources': [
                        'src/utils.cc',
                        'src/gvariantproxy.cc',
                        'src/webauthrequest.cc',
                        'src/webrequest.cc',
                        'src/webresponse.cc',
                        'src/webview.cc'
                    ],
                    'include_dirs': ["<!(node -e \"require('nan')\")"],
                    'cflags_cc': [
                        '<!@(pkg-config glib-2.0 --cflags)',
                        '<!@(pkg-config webkit2gtk-4.0 --cflags)',
                        '-I/usr/include/libsoup-2.4/libsoup',
                        '-I/usr/include/gtk-3.0/unix-print',
                        '-I/usr/include/gtk-3.0/gdk',
                        # '-DWNCK_I_KNOW_THIS_IS_UNSTABLE',
                    ],
                    'libraries':[
                        '<!@(pkg-config gtk+-3.0 --libs)',
                        '<!@(pkg-config glib-2.0 --libs)',
                        '<!@(pkg-config webkit2gtk-4.0 --libs)'
                    ],
                    'ldflags': ['-ldl']
                }]
            ]
        },
        {
            'target_name': 'webextension',
            'type': 'shared_library',
            'conditions': [
                ['OS=="linux"', {
                    'product_extension': 'so',
                    'sources': ['src/utils.cc', 'src/webextension.cc'],
                    'include_dirs': ["<!(node -e \"require('nan')\")"],
                    'cflags': ['-fPIC'],
                    'cflags_cc': [
                        '<!@(pkg-config glib-2.0 --cflags)',
                        '<!@(pkg-config webkit2gtk-4.0 --cflags)',
                        '-I/usr/include/libsoup-2.4/libsoup'
                    ],
                    'libraries':[
                        '<!@(pkg-config glib-2.0 --libs)',
                        '<!@(pkg-config webkit2gtk-4.0 --libs)',
                        '-ldl'
                    ]
                }]
            ]
        },
        {
            'target_name': 'mkdirs',
            'type': 'none',
            'dependencies': [],
            'conditions': [
                ['OS=="linux"', {
                    'actions': [
                        {
                            'action_name': 'make_dirs',
                            'inputs': [],
                            'outputs': [
                                'lib/ext'
                            ],
                            'action': ['mkdir', '-p', 'lib/ext']
                        }
                    ]
                }]
            ]
        },
        {
            'target_name': 'action_after_build',
            'type': 'none',
            'dependencies': ['mkdirs', 'webkit-gtk', 'webextension'],
            'conditions': [
                ['OS=="linux"', {
                    'actions': [
                        {
                            'action_name': 'move_node',
                            'inputs': [
                                '<@(PRODUCT_DIR)/webkit-gtk.node'
                            ],
                            'outputs': [
                                'lib/webkit-gtk'
                            ],
                            'action': ['cp', '<@(PRODUCT_DIR)/webkit-gtk.node', 'lib/webkit-gtk.node']
                        },
                        {
                            'action_name': 'move_ext',
                            'inputs': [
                                '<@(LIB_DIR)/webextension.so'
                            ],
                            'outputs': [
                                'lib/ext/webextension'
                            ],
                            'action': ['cp', '<@(LIB_DIR)/webextension.so', 'lib/ext/']
                        }
                    ]
                }]
            ]
        }
    ]
}
