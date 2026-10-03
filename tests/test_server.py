import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import Mock
import server

class ServerChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.brain = Mock(meta={'neurons':165122})
        server.brain.step.return_value = {'drive':0, 'turn':0}
        cls.http = ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.worker = threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.worker.join()

    def request(self,method,path,origin,body=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port)
        conn.request(method,path,body=json.dumps(body) if body is not None else None,
                     headers={'Origin':origin,'Content-Type':'application/json'})
        response=conn.getresponse();result=(response.status,dict(response.getheaders()),response.read())
        conn.close();return result

    def test_exact_extension_origin(self):
        origin=f'chrome-extension://{server.EXTENSION_ID}'
        status,headers,_=self.request('OPTIONS','/api/step',origin)
        self.assertEqual(status,204)
        self.assertEqual(headers['Access-Control-Allow-Origin'],origin)
        status,_,_=self.request('POST','/api/step',origin,{'width':1,'height':1,'pixels':[.5]})
        self.assertEqual(status,200)

    def test_reject_web_and_other_extensions(self):
        for origin in ['https://example.com','chrome-extension://'+'a'*32]:
            status,headers,_=self.request('POST','/api/step',origin,{})
            self.assertEqual(status,403)
            self.assertNotIn('Access-Control-Allow-Origin',headers)

    def test_invalid_frame(self):
        status,_,_=self.request('POST','/api/step','http://127.0.0.1:8765',{'width':2,'height':2,'pixels':[1]})
        self.assertEqual(status,400)
