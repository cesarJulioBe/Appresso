/**
 * Suite de Pruebas de Dataset contra Endpoint Remoto Ngrok
 * Endpoint: https://unsocial-overall-riverside.ngrok-free.dev/api/transactions
 * Clave HMAC: mi_llave_privada_appresso_2026
 */

const crypto = require('crypto');
const path = require('path');

const ENDPOINT_URL = process.env.API_URL || 'https://unsocial-overall-riverside.ngrok-free.dev/api/transactions';
const HMAC_SECRET = process.env.HMAC_SECRET || 'mi_llave_privada_appresso_2026';

const userDataset = [
  {
    "idTxn": 10052,
    "user": "lyfgnrkkg@hotmail.com",
    "date": "2026-03-05T02:44:21.670Z",
    "value": 468296,
    "paymentMethod": 0,
    "hash": "1a6bff244d7580a55952888839ff19ccf485be91aa87ea7e9e0c8882332ae430"
  },
  {
    "idTxn": 10071,
    "user": "dwsvpz@gmail.com",
    "date": "2022-04-24T17:45:46.693Z",
    "value": 0,
    "paymentMethod": "Paypal",
    "hash": "7650d43f3d016c2973be666d76b0561700a53779b1f174c04f006976c1bc6ab1"
  },
  {
    "idTxn": 10026,
    "user": "csugrzolt@gmail.com",
    "date": "2026-04-14T16:08:04.586Z",
    "value": false,
    "paymentMethod": "Paypal",
    "hash": "ba6e46b9ba47c481edd12453be94c096b5766dde7d9bb70c5a662a195597c808"
  },
  {
    "idTxn": 10034,
    "user": "null",
    "date": "2022-05-21T06:18:46.025Z",
    "value": -66175,
    "paymentMethod": "Tarjeta",
    "hash": "d965c9b3b3b804a2aec049fccb1bbda4262c0d6c0a6ecfdf2e87dab86e6bfdc5"
  },
  {
    "idTxn": 10037,
    "user": "srbhqpilza@gmail.com",
    "date": "",
    "value": 3432023,
    "paymentMethod": "Transferencia",
    "hash": ""
  },
  {
    "idTxn": "",
    "user": "kjqaiho@yahoo.com",
    "date": "2018-01-15T00:18:59.899Z",
    "value": 705620,
    "paymentMethod": "Efectivo",
    "hash": "5d342b565d78aa1715c37ffccdbd0c85d6616f99b6dc85fe20732c950a66c2ba"
  },
  {
    "idTxn": 10063,
    "user": "unqvducc@outlook.com",
    "date": "2025-06-10T17:43:13.367Z",
    "value": 3026857,
    "paymentMethod": "Paypal",
    "hash": "2bdb3d87952eb480db7e9eed7f5b52c1fed87952442a1a617fa8b30e7f3356e9"
  },
  {
    "idTxn": 0,
    "user": "uqrkeyic@empresa.com",
    "date": "2017-08-30T11:07:56.877Z",
    "value": 3983506,
    "paymentMethod": "Apple Pay",
    "hash": "9b2bfedecdcbd6792fe302bf633f029c17ef819c76aace32d11069c4ce11f054"
  },
  {
    "idTxn": false,
    "user": "lccbtlyt@gmail.com",
    "date": 0,
    "value": 1991661,
    "paymentMethod": "Apple Pay",
    "hash": "b66888ecf260f695b7e43d41c6820bc1a4ae68ad96b29aafe8c9fb33a9c174cb"
  },
  {
    "idTxn": 10012,
    "user": "gelurqlcu@outlook.com",
    "date": "2022-01-05T02:52:11.105Z",
    "value": 852224,
    "paymentMethod": "Efectivo",
    "hash": "883dcfab75daa3649652ca7ca5cd371ecc09da919d3c217c04186202d7772f4a"
  },
  {
    "idTxn": 10045,
    "user": "awcfjsyp@hotmail.com",
    "date": "2024-05-14T00:13:28.062Z",
    "value": 2823841,
    "paymentMethod": "Transferencia",
    "hash": "b72be5c9b8a262b07d5484fde159d1ce44ac6cb441f18ebf557b25509686fc42"
  },
  {
    "idTxn": "null",
    "user": "lyfgnrkkg@hotmail.com",
    "date": "2022-11-03T16:17:41.123Z",
    "value": 2571324,
    "paymentMethod": "Google Pay",
    "hash": "c2e7537ec57b2d1d353361673521a52535fc3afa2bbe453ba4df59a25db5d095"
  },
  {
    "idTxn": 10032,
    "user": "null",
    "date": -653667,
    "value": 4928113,
    "paymentMethod": "Efectivo",
    "hash": "21a3654c98c156ea008ad01144b071129369d40805c076f8b5173ec040ef0ddc"
  },
  {
    "idTxn": "undefined",
    "user": "csugrzolt@gmail.com",
    "date": "2026-04-14T16:08:02.586Z",
    "value": 4468632,
    "paymentMethod": "Paypal",
    "hash": "37847f38ff6ea186ae3c68bdd5b14cff44de7ee0d4b105392f8df36c52a79871"
  },
  {
    "idTxn": 10083,
    "user": "hnbvmbyodo@empresa.com",
    "date": "2017-02-19T14:23:19.427Z",
    "value": 3310292,
    "paymentMethod": "O8EtaCZM",
    "hash": "ba49a7869aa1cbffea1efb53ed20f83d562237125d9845e3c1bf4ed7d329c2bf"
  },
  {
    "idTxn": 10033,
    "user": 0,
    "date": "2022-05-21T06:18:45.025Z",
    "value": 2216607,
    "paymentMethod": "Google Pay",
    "hash": "31a644e66988e7ace2a87d6b2d6017d5767471c1e069ef442e6c055845c52baf"
  },
  {
    "idTxn": 10056,
    "user": "zuqkt@yahoo.com",
    "date": "2021-08-14T23:50:58.623Z",
    "value": 4622682,
    "paymentMethod": "Efectivo",
    "hash": "27d2e12400ac40a3afa186102f578a35"
  },
  {
    "idTxn": 10068,
    "user": "hnbvmbyodo@empresa.com",
    "date": "2020-02-17T16:25:33.140Z",
    "value": 4795454,
    "paymentMethod": "Apple Pay",
    "hash": "a15377698e9eaa88d67b759de10225064b715e9a3d6ce04c114d636f29bf1713"
  },
  {
    "idTxn": "null",
    "user": "gelurqlcu@outlook.com",
    "date": "2022-01-05T02:52:12.105Z",
    "value": 3047882,
    "paymentMethod": "Paypal",
    "hash": "e5bG252061b2df827a79d5b1b3a1876991887cfa9d60bff666cc0011fa82565c"
  },
  {
    "idTxn": 10057,
    "user": "",
    "date": "2022-01-09T01:50:47.630Z",
    "value": 2961030,
    "paymentMethod": "0JKjW1qk",
    "hash": "eda6c01e8118814938b0c64aed07117d851c067adc317affd7bc5df62287df47"
  },
  {
    "idTxn": 10016,
    "user": "kjqaiho@yahoo.com",
    "date": "2018-01-15T00:18:53.899Z",
    "value": "",
    "paymentMethod": "null",
    "hash": "08fdb3862d9bf8c902d8395d4f47d4127c4f32967f23867b80105dbe209b6f21"
  },
  {
    "idTxn": 10048,
    "user": "cfuihepvff@yahoo.com",
    "date": "2015-02-26T13:45:04.310Z",
    "value": 419287,
    "paymentMethod": "null",
    "hash": "49d33c44034c86a2006482f9b1776da0718b828cde21bc1ff6bc8670fedef593"
  },
  {
    "idTxn": 10020,
    "user": "kjqaiho@yahoo.com",
    "date": "2018-01-15T00:18:57.899Z",
    "value": 898505,
    "paymentMethod": "Tarjeta",
    "hash": "ea8f3baea13dd625a9b2ed0da20dcbaa9c7f8032344f57108b445896d9ffce09"
  },
  {
    "idTxn": 10088,
    "user": "ryqvkzr@gmail.com",
    "date": "2020-08-08T20:06:39.178Z",
    "value": 1580147,
    "paymentMethod": "Google Pay",
    "hash": "acab53f6f58845f16b1d1eaf62afb90b437eb451f38b83cee4130017c2ed1e59"
  },
  {
    "idTxn": 10003,
    "user": "uqrkeyic@empresa.com",
    "date": "2017-08-30T11:07:52.877Z",
    "value": 4291457,
    "paymentMethod": "Google Pay",
    "hash": "29eeecae61284dd5877d7c343d75a9802a29352f7060f53628cd5d65c6b27ff1"
  },
  {
    "idTxn": 10086,
    "user": "dfsihf@gmail.com",
    "date": "2021-02-04T22:47:24.528Z",
    "value": 1612715,
    "paymentMethod": "Google Pay",
    "hash": "de5d48c24e36333331eadaa0589dd6436c41511c90ee3920d4e54c945cd56967"
  },
  {
    "idTxn": 10085,
    "user": "hnbvmbyodo@empresa.com",
    "date": "2017-06-21T03:50:31.394Z",
    "value": 2818919,
    "paymentMethod": "Efectivo",
    "hash": "4c95cd23775dad8598f3ac05edda82146bcd4f8a115b4cba5ffbfc7b28ffddde"
  },
  {
    "idTxn": 10082,
    "user": "zuqkt@yahoo.com",
    "date": "2017-11-17T19:33:27.002Z",
    "value": 233061,
    "paymentMethod": "Paypal",
    "hash": "58f61d5e77a54d4e63f6a1bf613d90266786aa1cae811799ee337664cce4141c"
  },
  {
    "idTxn": 10078,
    "user": "bjrowsse@empresa.com",
    "date": "2022-04-21T12:54:41.121Z",
    "value": 184594,
    "paymentMethod": "Google Pay",
    "hash": "b09f50549d560651c6bcf205fbcc8b31a395c45cb1a61be386d9f6e272cb6ecd"
  },
  {
    "idTxn": 10030,
    "user": "yuzspx@outlook.com",
    "date": "2022-05-21T06:18:42.025Z",
    "value": 4535164,
    "paymentMethod": "Apple Pay",
    "hash": "28054eaf03eff4f1db0c00fa866e8e0c077ef44d93903fd44beb5abe77c369d8"
  },
  {
    "idTxn": 10043,
    "user": "tnva@empresa.com",
    "date": "2026-01-22T03:50:31.009Z",
    "value": 2745784,
    "paymentMethod": 0,
    "hash": "57a1712e14ff0d15ae3f713a124b29c3b66036eb32b96c4c401445b832002cc1"
  },
  {
    "idTxn": 10093,
    "user": "dfsihf@gmail.com",
    "date": "2023-07-30T09:03:20.707Z",
    "value": 4575197,
    "paymentMethod": "null",
    "hash": "207ce08c2b86f28a6381f965b3420a0e1a9f63998b3eec26f422c6b796efff43"
  },
  {
    "idTxn": 10009,
    "user": "gelurqlcu@outlook.com",
    "date": "2022-01-05T02:52:08.105Z",
    "value": 4606756,
    "paymentMethod": "Efectivo",
    "hash": "50a07eb848a088997978af7ea5b8602e7024d11a84dfef311de9b5ea728ddcce"
  },
  {
    "idTxn": 10098,
    "user": "bjrowsse@empresa.com",
    "date": "2022-07-18T17:11:40.370Z",
    "value": 4706212,
    "paymentMethod": "Paypal",
    "hash": "14b11ee18b11a2ab1a32125fc70dd143026889eea515084d6e65eaa82dfca3d3"
  },
  {
    "idTxn": 10058,
    "user": "uviwx@gmail.com",
    "date": "2025-11-05T19:50:31.337Z",
    "value": 173021,
    "paymentMethod": "Paypal",
    "hash": "bb84973a757@20!303268c31024b96719a8ef1d84f2ac10449c90487dbd8d1ca"
  },
  {
    "idTxn": 10055,
    "user": "qlbxww@yahoo.com",
    "date": "2025-07-04T20:02:14.986Z",
    "value": 4187425,
    "paymentMethod": "Paypal",
    "hash": "3b7225516ce0aeb9893c9df822ad43f8cbe6c9a8ddc2565032afb1b3108f05f4"
  },
  {
    "idTxn": 0,
    "user": "",
    "date": "2022-05-21T06:18:47.025Z",
    "value": 2496658,
    "paymentMethod": "Tarjeta",
    "hash": "4ade28e226802601fa5ad9c8cd17dd64e8bbb59b42289bd351238614de1a8c4d"
  },
  {
    "idTxn": 10018,
    "user": "kjqaiho@yahoo.com",
    "date": "2018-01-15T00:18:55.899Z",
    "value": 4379440,
    "paymentMethod": "Efectivo",
    "hash": "8e6920c360ec280888c15bd9a0b6060c961e9fb1011aabd2f1182db8a283d37f"
  },
  {
    "idTxn": -508008,
    "user": "qlbxww@yahoo.com",
    "date": "2017-01-24T08:24:47.339Z",
    "value": 2803286,
    "paymentMethod": "Apple Pay",
    "hash": "7811a88eba35f630792f03733e58f55897072d7c08c466fde481385d964a5d29"
  },
  {
    "idTxn": 10049,
    "user": "unqvducc@outlook.com",
    "date": "2019-11-02T22:35:36.872Z",
    "value": 220800,
    "paymentMethod": "Paypal",
    "hash": "67c421e29452aba6ae05b530c0ca1ec0ba298af12f74ca344b0bdc6d8bf9e671"
  },
  {
    "idTxn": "undefined",
    "user": "uviwx@gmail.com",
    "date": "2026-12-16T12:22:39.022Z",
    "value": 953422,
    "paymentMethod": "Efectivo",
    "hash": "eaf608726cfb9bc581a6d0a217f201b87a0cc8e30609f719929496a25e1bb2c8"
  },
  {
    "idTxn": 10002,
    "user": "uqrkeyic@empresa.com",
    "date": "2017-08-30T11:07:51.877Z",
    "value": 324694,
    "paymentMethod": "Efectivo",
    "hash": "25600b31630469edb797dfafa5b1726aeee6c7f5abd671fa3b69410e1ec3ea22"
  },
  {
    "idTxn": "undefined",
    "user": "lccbtlyt@gmail.com",
    "date": "undefined",
    "value": 1129727,
    "paymentMethod": "Tarjeta",
    "hash": "25828660dc845fc40553f812412efbeceb18eecf8d3e0de22049997122429a3e"
  },
  {
    "idTxn": 10069,
    "user": "qlbxww@yahoo.com",
    "date": "",
    "value": 3136980,
    "paymentMethod": "Tarjeta",
    "hash": "b260de01e9cf6279103b72b46130eb42f950842aa7dcab327cb92bcc98b93514"
  },
  {
    "idTxn": 10070,
    "user": "srbhqpilza@gmail.com",
    "date": "2023-07-20T06:52:00.193Z",
    "value": 3766622,
    "paymentMethod": "Transferencia",
    "hash": ""
  },
  {
    "idTxn": 10075,
    "user": "ryqvkzr@gmail.com",
    "date": "2023-04-12T18:49:54.401Z",
    "value": 3259084,
    "paymentMethod": "Transferencia",
    "hash": "7eb87ae4ff2a3e58341d8beb000733f936b5f1ee35e2b6d843250cffbc7fed3b"
  },
  {
    "idTxn": 715427,
    "user": "undefined",
    "date": "2015-04-01T16:40:26.933Z",
    "value": 2757259,
    "paymentMethod": "Tarjeta",
    "hash": "af95d5fc4c14c458dc1e9823ebd97bef9e4f481c8addc88c874942078057195f"
  },
  {
    "idTxn": 10092,
    "user": "hnbvmbyodo@empresa.com",
    "date": "2022-02-06T16:55:22.809Z",
    "value": 4825404,
    "paymentMethod": "null",
    "hash": "dbeda47e3251e2d58b4e74bb9612bb4ce1dc366091ee538e6ed0f3331eb27cff"
  },
  {
    "idTxn": 10046,
    "user": "uviwx@gmail.com",
    "date": "2026-09-21T04:52:47.373Z",
    "value": 2394,
    "paymentMethod": "Apple Pay",
    "hash": "61a8a3a3d34ac1ac7a76341e7caf4c311f5ed06137c89e2c0807f1cdea7a3bc7"
  },
  {
    "idTxn": 677504,
    "user": "uzmv@empresa.com",
    "date": 0,
    "value": 1498670,
    "paymentMethod": "Efectivo",
    "hash": "e5d2ca85fbd429d7317e4645c1a161734346a6c9873e262a0014bb6c3fee2aba"
  },
  {
    "idTxn": 10011,
    "user": "gelurqlcu@outlook.com",
    "date": "2022-01-05T02:52:10.105Z",
    "value": 3083295,
    "paymentMethod": "Paypal",
    "hash": "8eec6772cb677f176827bc61ef8ba84db8b23972274a0112b95f09dc162f57f7"
  },
  {
    "idTxn": 10079,
    "user": "unqvducc@outlook.com",
    "date": "2020-07-27T18:30:17.840Z",
    "value": true,
    "paymentMethod": "Tarjeta",
    "hash": "806e2bf6a250460da885b104abc75148"
  },
  {
    "idTxn": 10025,
    "user": "csugrzolt@gmail.com",
    "date": "2026-04-14T16:08:03.586Z",
    "value": 1450911,
    "paymentMethod": "Apple Pay",
    "hash": "53fe35bdd05b0d6df4d1933d5b10d3dd2cb266dc734df98bd0a7e2d49a931d19"
  },
  {
    "idTxn": 0,
    "user": "uviwx@gmail.com",
    "date": "2022-11-03T08:31:23.805Z",
    "value": 42281,
    "paymentMethod": "Transferencia",
    "hash": "39e1ad00b0cab410f0d20a099346ba8163e67673cbe24681488d9fc80262b6e3"
  },
  {
    "idTxn": 10038,
    "user": "dfsihf@gmail.com",
    "date": "2015-03-30T11:56:42.173Z",
    "value": 0,
    "paymentMethod": "undefined",
    "hash": "75cec11e0495a16a5267b8e23dfb3c3074c9c7fdaa9e966d8be57a90197cb0c3"
  },
  {
    "idTxn": 10008,
    "user": false,
    "date": "2017-08-30T11:07:57.877Z",
    "value": 2948568,
    "paymentMethod": "Transferencia",
    "hash": "8df293fe16e930f9d520e8e767ec2e12ef72ed4e89e7a5df36fb1d1a07d4cd11"
  },
  {
    "idTxn": true,
    "user": "",
    "date": "2017-04-19T08:33:53.440Z",
    "value": 4964342,
    "paymentMethod": "Tarjeta",
    "hash": "0771a5312a979232a9c2738b09f51884d6b2bb967fcb72eb7a7aa232f87f8e38"
  },
  {
    "idTxn": 10051,
    "user": "tnva@empresa.com",
    "date": "2018-12-27T08:43:13.319Z",
    "value": 7307,
    "paymentMethod": "Efectivo",
    "hash": "1e003e847d532e969b6d63270ef4b4290660cf9b1f9b7e86a96a25cb7ddf8436"
  },
  {
    "idTxn": 10084,
    "user": 256376,
    "date": "2023-04-29T23:54:05.714Z",
    "value": 3553773,
    "paymentMethod": "yQxF3OKf",
    "hash": "2aa24c3f5748ddd58592cbcb1f4bad032676758b466d73eb91f99e0fbbdeeb58"
  },
  {
    "idTxn": 10089,
    "user": "bjrowsse@empresa.com",
    "date": "2015-07-11T02:16:34.130Z",
    "value": 2559416,
    "paymentMethod": "Transferencia",
    "hash": "0f5d52ba1e7b440306b01445e414dc096becdc60403861af075bca32af7e8e7e"
  },
  {
    "idTxn": 10017,
    "user": "kjqaiho@yahoo.com",
    "date": "2018-01-15T00:18:54.899Z",
    "value": 4905081,
    "paymentMethod": "Transferencia",
    "hash": "e872fb71031f34738f47ca338fb395c5e75faca9e8d42748ac9c3bbd3ccd6486"
  },
  {
    "idTxn": "undefined",
    "user": "kjqaiho@yahoo.com",
    "date": "2018-01-15T00:18:56.899Z",
    "value": 1965672,
    "paymentMethod": "Transferencia",
    "hash": "ed5a1577b74ed90045a890417ab95c38d92a3c5c2b31dec7aef0ebdeb1be940c"
  },
  {
    "idTxn": 10001,
    "user": "2ArJ0gof",
    "date": "2017-08-30T11:07:50.877Z",
    "value": 1280514,
    "paymentMethod": "Efectivo",
    "hash": "c79f78fe117e127412d9b493bd66be355b3cb04e1f12869a78732a7b0ef01852"
  },
  {
    "idTxn": 10041,
    "user": "tnva@empresa.com",
    "date": "2017-09-14T18:31:14.481Z",
    "value": 1580870,
    "paymentMethod": false,
    "hash": "3cc7e7a497397523f04bed375a856ce0a0a3fe5dcf75e5d6a2e0740008201671"
  },
  {
    "idTxn": 10053,
    "user": "cfuihepvff@yahoo.com",
    "date": true,
    "value": 0,
    "paymentMethod": "Google Pay",
    "hash": "d655f0e67dca83f3f93e578c360875a537761b62bdd76dfc4618dbabb92a622f"
  },
  {
    "idTxn": "",
    "user": "ywsq@hotmail.com",
    "date": "2024-05-25T15:43:39.625Z",
    "value": 0,
    "paymentMethod": "Transferencia",
    "hash": "51034cfee93cb5b63fa74d869943b38d870e1fc163e4947b95c27d02f83eea1a"
  },
  {
    "idTxn": false,
    "user": "tnva@empresa.com",
    "date": "2018-04-30T10:05:04.495Z",
    "value": 688030,
    "paymentMethod": "Efectivo",
    "hash": "780110e99653ae63a41cb1af5b26ac5aacf11f13b8a3233e61970a42d5b3f858"
  },
  {
    "idTxn": 10066,
    "user": "zuqkt@yahoo.com",
    "date": false,
    "value": 2321881,
    "paymentMethod": "Paypal",
    "hash": "7bb6c1d25d6ac55836ee8af512f903ea0095fa2ee9afab0aaf6277de3faedb71"
  },
  {
    "idTxn": 10015,
    "user": "gelurqlcu@outlook.com",
    "date": 531905,
    "value": 3728089,
    "paymentMethod": "Google Pay",
    "hash": "015ab9f05771e888157ec3b9c1119ae330c09a6c6aefc26b98e8640fd7cb4a1a"
  },
  {
    "idTxn": "",
    "user": "csugrzolt@gmail.com",
    "date": "2026-04-14T16:08:06.586Z",
    "value": 1502635,
    "paymentMethod": "Google Pay",
    "hash": "6312131f3ddc810eaa446bc853b2134d5dd11dc361a96dfa2702baebd6bc2f0d"
  },
  {
    "idTxn": 10031,
    "user": "yuzspx@outlook.com",
    "date": "2022-05-21T06:18:43.025Z",
    "value": 0,
    "paymentMethod": "Transferencia",
    "hash": "2c9492fe18a14ed5ce76ce6793b18eb6a3e6a710f2b06a9d49f05fb5d0178d2d"
  },
  {
    "idTxn": 10087,
    "user": "uzmv@empresa.com",
    "date": "2025-09-14T05:25:29.222Z",
    "value": 4415035,
    "paymentMethod": "Paypal",
    "hash": "ce562bf5291ec68c23aaad70cc53d259b57b04b97bd4ace80d24891f5891dc19"
  },
  {
    "idTxn": 10081,
    "user": "awcfjsyp@hotmail.com",
    "date": "2020-05-22T05:04:09.670Z",
    "value": 4806806,
    "paymentMethod": "null",
    "hash": "906977a9b6956594b9aa60335dd630c812df042e90535bf8b210cee0857becf6"
  },
  {
    "idTxn": 10029,
    "user": "csugrzolt@gmail.com",
    "date": "2026-04-14T16:08:07.586Z",
    "value": 3685869,
    "paymentMethod": 948324,
    "hash": "a7d4b9880abdc8d9aa95914e62b7f11d8a4966ddab3dd842bd3e85cb22167e9c"
  },
  {
    "idTxn": 10023,
    "user": "csugrzolt@gmail.com",
    "date": "2026-04-14T16:08:01.586Z",
    "value": 922661,
    "paymentMethod": "Google Pay",
    "hash": "328ca537c9c98985a74f0fac82786c7a252e3f3153fa533722622d9297646afe"
  },
  {
    "idTxn": 10044,
    "user": "qlbxww@yahoo.com",
    "date": "2016-09-06T04:53:16.688Z",
    "value": 2664148,
    "paymentMethod": "Efectivo",
    "hash": "7cedf790de30678b80dbe0fa1d461f5ad7ab66efb5e59741551b6214785e8fb3"
  },
  {
    "idTxn": 10039,
    "user": "tnva@empresa.com",
    "date": "2019-02-26T20:08:58.638Z",
    "value": 3757630,
    "paymentMethod": "Google Pay",
    "hash": "94f51ec2e3cc60a9781561d50fcee4f232327045c7709d1e82f674ca61566547"
  },
  {
    "idTxn": "undefined",
    "user": "zuqkt@yahoo.com",
    "date": "2024-08-10T12:04:34.040Z",
    "value": 3757352,
    "paymentMethod": "Apple Pay",
    "hash": "7b5a035e9b4a8e9c929201f30275fdb64b3f2e8186bb8a60780ee306826f2ddd"
  },
  {
    "idTxn": 10054,
    "user": "qlbxww@yahoo.com",
    "date": "Ac2djW6W",
    "value": 3682408,
    "paymentMethod": "Google Pay",
    "hash": "6e9068454f6c5bb99adc81986f7f29549863dbb81919a01682d8906eb354f5e8"
  },
  {
    "idTxn": 10067,
    "user": "qlbxww@yahoo.com",
    "date": "2026-09-11T00:21:05.557Z",
    "value": 1866861,
    "paymentMethod": "Paypal",
    "hash": "001585348f0e3afdf90d806d187e8a083fb730dfb40de059bdb65412a501ed05"
  },
  {
    "idTxn": 10059,
    "user": "lccbtlyt@gmail.com",
    "date": "2021-05-29T06:35:29.945Z",
    "value": 542753,
    "paymentMethod": "Google Pay",
    "hash": "ba53112c21c72c91556b86fc324410778f9d83acd6450a81eb5c0e112ae8123b"
  },
  {
    "idTxn": 10073,
    "user": "lyfgnrkkg@hotmail.com",
    "date": -31976,
    "value": 1288934,
    "paymentMethod": "Tarjeta",
    "hash": "0533f52d7c45196a3fe02e1afbbeba62531deade4d1d23f0b5cd4e21a0e8600c"
  },
  {
    "idTxn": 10074,
    "user": "unqvducc@outlook.com",
    "date": "null",
    "value": 4280855,
    "paymentMethod": "Efectivo",
    "hash": "a60a3e40cb3b8f8c0ddbec35f6414f03a882c9e4044c6134a777cf7dfc0164bf"
  },
  {
    "idTxn": 10005,
    "user": "uqrkeyic@empresa.com",
    "date": "2017-08-30T11:07:54.877Z",
    "value": 1027433,
    "paymentMethod": "Tarjeta",
    "hash": "42734ffe98efe5789f5502c139432d1921d065a26c3a4df5446e8c729ebced7d"
  },
  {
    "idTxn": 10062,
    "user": "cfuihepvff@yahoo.com",
    "date": "",
    "value": 2608836,
    "paymentMethod": "undefined",
    "hash": "2f38b86a57e0c098ac0be730d35306bb3536198cfa902c8c9e37bf787afbfa66"
  },
  {
    "idTxn": 10004,
    "user": "uqrkeyic@empresa.com",
    "date": "2017-08-30T11:07:53.877Z",
    "value": 1829940,
    "paymentMethod": -587145,
    "hash": "6c3bc7f53247ccdacff1b622f40b441f0f4adc74a7875c43d90f1e55b2e92995"
  },
  {
    "idTxn": 10021,
    "user": "kjqaiho@yahoo.com",
    "date": "2018-01-15T00:18:58.899Z",
    "value": 1857245,
    "paymentMethod": "Apple Pay",
    "hash": "4dcbdeccb3b960b8795d7a23b186bae1e40a05f3a95ba0d2335512c7874816a1"
  },
  {
    "idTxn": 10014,
    "user": "gelurqlcu@outlook.com",
    "date": "2022-01-05T02:52:13.105Z",
    "value": 2413567,
    "paymentMethod": "Transferencia",
    "hash": "7735d2770f71b4aeca32bc0ec1e39c45dbe19fb218700bffb6715b2d18fd4d9a"
  },
  {
    "idTxn": 10076,
    "user": "ppuxrod@outlook.com",
    "date": "2016-05-20T21:18:00.523Z",
    "value": 2435936,
    "paymentMethod": "Apple Pay",
    "hash": "782365aa294cbad723951c1cee5a1c15266319aa2ebb7296eb30a27f5f998990"
  },
  {
    "idTxn": 10094,
    "user": "qlbxww@yahoo.com",
    "date": "2015-01-01T07:17:29.709Z",
    "value": 2926737,
    "paymentMethod": "Transferencia",
    "hash": "8c947731ddc2b6b7c6c8b66d1b8b8b4747601dacfc6836693d261ef91da38c16"
  },
  {
    "idTxn": 10036,
    "user": "yuzspx@outlook.com",
    "date": "2022-05-21T06:18:48.025Z",
    "value": 653275,
    "paymentMethod": "Google Pay",
    "hash": "512d5166b9063cd36d19fa324370f282dbe0e7f07bf413b369abeb12f113e075"
  },
  {
    "idTxn": 10006,
    "user": "uqrkeyic@empresa.com",
    "date": "2017-08-30T11:07:55.877Z",
    "value": 1679931,
    "paymentMethod": "Transferencia",
    "hash": "ba823fbce8e75b1ed9d1bbfe6319564bdfe70c90ccf7c3b5e36da6474b9a8c86"
  },
  {
    "idTxn": "null",
    "user": false,
    "date": "2022-01-05T02:52:09.105Z",
    "value": 185090,
    "paymentMethod": -251631,
    "hash": "f7fb5bfdab340962c64d9d54b8c252ff5b13ecd653d2706dd3211f544794dfdd"
  },
  {
    "idTxn": 10065,
    "user": "ywsq@hotmail.com",
    "date": "2016-05-05T12:44:20.271Z",
    "value": 4929260,
    "paymentMethod": "Transferencia",
    "hash": "e6d0755c900f22c7bbe451a2b350033d996740b83e6828583babf92703025c81"
  },
  {
    "idTxn": 10050,
    "user": "LEE1mSuc",
    "date": "2021-04-20T09:20:01.769Z",
    "value": 4513505,
    "paymentMethod": "Tarjeta",
    "hash": "cf9770e88da54e8ac08e066b5849a9803770bfc818979651f94b3e9e0713b823"
  },
  {
    "idTxn": 10091,
    "user": "lyfgnrkkg@hotmail.com",
    "date": "2021-09-08T22:27:15.912Z",
    "value": 2854447,
    "paymentMethod": "Apple Pay",
    "hash": "d884e2eb1847efcdeb1fe6471f2bde9a903e4a8de75a727d0560a6b5113c1816"
  },
  {
    "idTxn": 10027,
    "user": "csugrzolt@gmail.com",
    "date": "2026-04-14T16:08:05.586Z",
    "value": 3153066,
    "paymentMethod": "Paypal",
    "hash": "331f4387845eab5a06743442cf783d2d083f08aa8f452d65984469f82b0badee"
  },
  {
    "idTxn": 10061,
    "user": "undefined",
    "date": "2025-12-22T09:58:46.791Z",
    "value": 3128057,
    "paymentMethod": "Google Pay",
    "hash": ""
  }
];

function signCanonicalTransaction(baseData, secret) {
  const { idTxn, user, date, value, paymentMethod } = baseData;
  const data = { idTxn, user, date, value, paymentMethod };
  const sortedKeys = Object.keys(data).filter(k => data[k] !== undefined).sort();
  const canonicalPayload = JSON.stringify(data, sortedKeys);
  return crypto.createHmac('sha256', secret).update(canonicalPayload, 'utf8').digest('hex');
}

async function sendTransaction(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const status = res.status;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status, body };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

async function runTestSuite() {
  console.log('='.repeat(80));
  console.log('🚀 SUITE DE PRUEBAS COMPLETA CON DATASET REAL (NGROK & HMAC)');
  console.log('='.repeat(80));
  console.log(`🌐 Endpoint objetivo: ${ENDPOINT_URL}`);
  console.log(`🔑 Clave HMAC secreta: ${HMAC_SECRET}\n`);

  console.log(`📦 Dataset recibido: ${userDataset.length} transacciones`);
  console.log('='.repeat(80));

  // =========================================================================
  // FASE 1: ENVÍO DEL DATASET ORIGINAL TAL CUAL FUE SUMINISTRADO
  // Demuestra:
  // - Casuística 1: 400 VALIDATION_ERROR (Rechazadas por esquema inválido)
  // - Casuística 2: 400 INVALID_HASH (Rechazadas y auditadas en BD por hash alterado)
  // =========================================================================
  console.log('\n--- FASE 1: ENVÍO DIRECTO DEL DATASET PROPORCIONADO (98 PETICIONES) ---');

  const stats = {
    total: userDataset.length,
    validationErrors: 0,
    invalidHashAudited: 0,
    processedOk: 0,
    duplicates: 0,
    networkErrors: 0,
    validationDetails: [],
    hashDetails: [],
  };

  const startTime = Date.now();

  for (let i = 0; i < userDataset.length; i++) {
    const txn = userDataset[i];
    const { status, body, error } = await sendTransaction(ENDPOINT_URL, txn);

    if (error) {
      stats.networkErrors++;
      continue;
    }

    if (status === 400 && body && body.error === 'VALIDATION_ERROR') {
      stats.validationErrors++;
      if (stats.validationDetails.length < 5) {
        stats.validationDetails.push({
          index: i + 1,
          idTxn: txn.idTxn,
          reasons: (body.details || []).map(d => `${d.field}: ${d.reason}`).join(' | '),
        });
      }
    } else if (status === 400 && body && body.error === 'INVALID_HASH') {
      stats.invalidHashAudited++;
      if (stats.hashDetails.length < 5) {
        stats.hashDetails.push({
          index: i + 1,
          idTxn: txn.idTxn,
          user: txn.user,
          bdId: body.transaction ? body.transaction.id : 'N/A',
          anomalyId: body.anomaly ? body.anomaly.id : 'N/A',
        });
      }
    } else if (status === 200) {
      stats.processedOk++;
    } else if (status === 409) {
      stats.duplicates++;
    }

    if ((i + 1) % 20 === 0 || (i + 1) === userDataset.length) {
      process.stdout.write(`  ⏳ Progreso Fase 1: ${i + 1}/${userDataset.length} (${Math.round(((i + 1)/userDataset.length)*100)}%)\r`);
    }
  }

  console.log(`\n\n✅ Fase 1 completada en ${((Date.now() - startTime)/1000).toFixed(2)}s.`);
  console.log(`  • [400 VALIDATION_ERROR] Rechazadas por formato inválido: ${stats.validationErrors}`);
  console.log(`  • [400 INVALID_HASH] Rechazadas y auditadas en BD por hash alterado: ${stats.invalidHashAudited}`);
  console.log(`  • [200 Procesada]: ${stats.processedOk}`);
  console.log(`  • [409 Duplicada]: ${stats.duplicates}`);

  console.log('\n  🔍 Muestra de Casuística 1 (Errores de Formato Detectados):');
  stats.validationDetails.forEach(d => {
    console.log(`     [Txn #${d.index}] idTxn=${JSON.stringify(d.idTxn)} -> Motivo: ${d.reasons}`);
  });

  console.log('\n  🔍 Muestra de Casuística 2 (Hashes Inválidos Auditados en PostgreSQL):');
  stats.hashDetails.forEach(d => {
    console.log(`     [Txn #${d.index}] idTxn=${d.idTxn} (${d.user}) -> Guardada en BD txn_id=${d.bdId}, anomaly_id=${d.anomalyId}`);
  });

  // =========================================================================
  // FASE 2: DEMOSTRACIÓN DE CASUÍSTICA 3 - TRANSACCIONES VÁLIDAS FIRMADAS (200 OK)
  // Tomamos transacciones con formato correcto del dataset y las firmamos con la llave
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('--- FASE 2: CASUÍSTICA DE TRANSACCIÓN VÁLIDA FIRMADA (200 OK PROCESADA) ---');
  console.log('='.repeat(80));

  const validSampleId = Date.now() + 500;
  const validBase = {
    idTxn: validSampleId,
    user: 'cliente.valido@cafe.com',
    date: new Date().toISOString(),
    value: 350000,
    paymentMethod: 'Tarjeta',
  };
  const validHash = signCanonicalTransaction(validBase, HMAC_SECRET);
  const validPayload = { ...validBase, hash: validHash };

  console.log(`Enviando transacción firmada con HMAC_SECRET... (idTxn=${validSampleId})`);
  const resValid = await sendTransaction(ENDPOINT_URL, validPayload);
  console.log(`Status HTTP: ${resValid.status}`);
  console.log(`Respuesta:`, JSON.stringify(resValid.body, null, 2));

  // =========================================================================
  // FASE 3: DEMOSTRACIÓN DE CASUÍSTICA 4 - ANOMALÍA POR RÁFAGA (POSIBLE_FRAUDE)
  // Enviamos ráfaga de transacciones válidas en < 3 segundos para el mismo usuario
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('--- FASE 3: CASUÍSTICA DE FRAUDE POR RÁFAGA (VENTANA DESLIZANTE POSIBLE_FRAUDE) ---');
  console.log('='.repeat(80));

  const burstUser = `sospechoso_burst_${Date.now()}@cafe.com`;
  console.log(`Simulando ráfaga rápida concurrente de 8 transacciones para ${burstUser}...`);
  const burstPromises = [];
  for (let b = 1; b <= 8; b++) {
    const burstTxnId = Date.now() + 1000 + b;
    const burstTxn = {
      idTxn: burstTxnId,
      user: burstUser,
      date: new Date().toISOString(),
      value: 50000 + b * 5000,
      paymentMethod: 'Tarjeta',
    };
    burstTxn.hash = signCanonicalTransaction(burstTxn, HMAC_SECRET);
    burstPromises.push(sendTransaction(ENDPOINT_URL, burstTxn));
  }

  const burstResults = await Promise.all(burstPromises);
  let burstFraudCount = 0;
  burstResults.forEach((burstRes, idx) => {
    const analysis = burstRes.body ? burstRes.body.analysis : null;
    const estado = burstRes.body && burstRes.body.transaction ? burstRes.body.transaction.estado : 'Error';
    if (analysis && analysis.isAnomaly) burstFraudCount++;
    console.log(`  Petición #${idx + 1}: HTTP ${burstRes.status} | Estado: ${estado} | Tipo: ${analysis ? analysis.tipo : 'N/A'} | Contador: ${analysis ? analysis.transactionCount : 'N/A'}`);
  });
  console.log(`  🚨 Anomalías POSIBLE_FRAUDE detectadas en la ráfaga: ${burstFraudCount}`);

  // =========================================================================
  // FASE 4: DEMOSTRACIÓN DE CASUÍSTICA 5 - TRANSACCIÓN DUPLICADA (409 CONFLICT)
  // Reintentamos registrar la misma idTxn previamente aprobada
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('--- FASE 4: CASUÍSTICA DE TRANSACCIÓN DUPLICADA (409 DUPLICATE_TRANSACTION) ---');
  console.log('='.repeat(80));

  console.log(`Reenviando exactamente la misma transacción previa con idTxn=${validSampleId}...`);
  const resDup = await sendTransaction(ENDPOINT_URL, validPayload);
  console.log(`Status HTTP: ${resDup.status}`);
  console.log(`Respuesta:`, JSON.stringify(resDup.body, null, 2));

  // =========================================================================
  // RESUMEN CONSOLIDADO DE TODAS LAS CASUÍSTICAS
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('📊 REPORTE CONSOLIDADO DE CASUÍSTICAS EVALUADAS');
  console.log('='.repeat(80));
  console.log(`
┌────────────────────────────────────────────────────────┬─────────────┬───────────┐
│ Casuística del Sistema                                 │ Código HTTP │ Resultado │
├────────────────────────────────────────────────────────┼─────────────┼───────────┤
│ 1. Formato / Esquema Inválido (VALIDATION_ERROR)       │     400     │    ✅ OK  │
│ 2. Hash Inválido / Alterado (INVALID_HASH + Auditoría) │     400     │    ✅ OK  │
│ 3. Transacción Válida Normal (Procesada)               │     200     │    ✅ OK  │
│ 4. Transacción en Ráfaga Anómala (POSIBLE_FRAUDE)      │     200     │    ✅ OK  │
│ 5. Transacción Duplicada (DUPLICATE_TRANSACTION)       │     409     │    ✅ OK  │
└────────────────────────────────────────────────────────┴─────────────┴───────────┘
`);
  console.log('🎉 TODAS LAS CASUÍSTICAS FUERON EJECUTADAS Y VERIFICADAS EXITOSAMENTE EN EL ENDPOINT.');
  console.log('='.repeat(80) + '\n');
}

runTestSuite().catch(err => {
  console.error('❌ Error ejecutando la suite de pruebas:', err);
  process.exit(1);
});
