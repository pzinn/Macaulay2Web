# fedora + Macaulay2
FROM registry.fedoraproject.org/fedora-minimal:32
MAINTAINER Paul Zinn-Justin <pzinn@unimelb.edu.au>
RUN microdnf -y install sudo wget tar openssh openssh-server graphviz lapack cddlib gc glpk gmp-c++ openblas-serial openblas-threads libnauty libatomic_ops givaro mathic mathicgb-libs memtailor boost-stacktrace procps mpfr && microdnf clean all
# have to manually do this cause no systemd
RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N ''
RUN ssh-keygen -t dsa -f /etc/ssh/ssh_host_dsa_key -N ''

# Macaulay2
COPY Macaulay2-1.16.0.1-1.x86_64.rpm .
RUN rpm -i Macaulay2-1.16.0.1-1.x86_64.rpm
RUN rm Macaulay2-1.16.0.1-1.x86_64.rpm

# M2 userland, part 1.    
RUN useradd -m -d /home/m2user m2user
RUN mkdir /custom
RUN chown -R m2user:m2user /custom
RUN chmod -R 775 /custom

# Bertini and PHCpack
ENV PHC_VERSION 24
RUN (cd /custom; wget http://www.math.uic.edu/~jan/x86_64phcv${PHC_VERSION}p.tar.gz)
RUN (cd /custom; tar zxf x86_64phcv${PHC_VERSION}p.tar.gz; mv phc /usr/bin; rm x86_64phcv${PHC_VERSION}p.tar.gz)
# This is the only way extracting Bertini gives the right permissions.
ENV BERTINI_VERSION 1.6
RUN su m2user -c "/bin/bash;\
   cd /custom;\
   wget https://bertini.nd.edu/BertiniLinux64_v${BERTINI_VERSION}.tar.gz;\
   tar xzf BertiniLinux64_v${BERTINI_VERSION}.tar.gz;"
RUN ln -s /custom/BertiniLinux64_v${BERTINI_VERSION}/bertini /usr/bin/

